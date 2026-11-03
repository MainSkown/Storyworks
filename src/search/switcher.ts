import { AREAS, type Area, type IndexedItem, type ItemKind, type SearchIndex } from './index'
import { fold, foldMapped, originalRange } from './normalize'

export const RECENTS_MAX = 10

export interface SwitchEntry {
  id: string
  kind: ItemKind
  area: Area
  title: string
  /** Set when the query matched an alias rather than the title. */
  matchedAlias?: string
  /** Match range in the matched text (the alias if `matchedAlias`, else the title); 0..0 for recents. */
  matchStart: number
  matchEnd: number
  /** The scene's chapter or the node's timeline. */
  parentId?: string
}

/** Puts `id` first, drops duplicates, keeps at most 10. Returns a new list. */
export function pushRecent(list: readonly string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, RECENTS_MAX)
}

function entryOf(item: IndexedItem, extra: Partial<SwitchEntry> = {}): SwitchEntry {
  return {
    id: item.id,
    kind: item.kind,
    area: item.area,
    title: item.title,
    matchStart: 0,
    matchEnd: 0,
    ...(item.parentId ? { parentId: item.parentId } : {}),
    ...extra,
  }
}

function range(text: string, qf: string, at: number) {
  const r = originalRange(text, foldMapped(text), at, at + qf.length)
  return { matchStart: r.start, matchEnd: r.end }
}

/**
 * Jump palette: titles and aliases only (no body text). Empty query gives the recents that
 * still exist. Ranking: title starts with, title contains, alias starts with, alias contains;
 * ties go to recently opened, then document order.
 */
export function switchTo(
  index: SearchIndex,
  text: string,
  recents: readonly string[],
  limit = 20,
): SwitchEntry[] {
  const qf = fold(text.trim())
  if (qf === '') {
    return recents
      .map((id) => index.get(id))
      .filter((i): i is IndexedItem => i !== undefined)
      .slice(0, RECENTS_MAX)
      .map((i) => entryOf(i))
  }
  const recentRank = new Map(recents.map((id, i) => [id, i]))
  const hits: { entry: SwitchEntry; tier: number; recent: number; order: number }[] = []
  let order = 0
  for (const area of AREAS) {
    for (const item of index.items(area)) {
      order++
      let tier = -1
      let entry: SwitchEntry | null = null
      const at = item.titleFolded.indexOf(qf)
      if (at >= 0) {
        tier = at === 0 ? 0 : 1
        entry = entryOf(item, range(item.title, qf, at))
      } else {
        for (let i = 0; i < item.aliases.length; i++) {
          const a = item.aliasesFolded[i].indexOf(qf)
          if (a < 0) continue
          tier = a === 0 ? 2 : 3
          entry = entryOf(item, { matchedAlias: item.aliases[i], ...range(item.aliases[i], qf, a) })
          break
        }
      }
      if (entry) hits.push({ entry, tier, recent: recentRank.get(item.id) ?? Infinity, order })
    }
  }
  hits.sort((a, b) => a.tier - b.tier || a.recent - b.recent || a.order - b.order)
  return hits.slice(0, limit).map((h) => h.entry)
}
