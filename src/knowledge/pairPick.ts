import { KNOWLEDGE_KIND, type Link } from '../project/links'
import type { Position } from '../timeline/order'

export interface PickItem {
  id: string
  title: string
  tags: readonly string[]
  learnings: readonly { entryId: string; at: Position }[]
}

/** Items matching the query in title or tags, in their order. */
export function filterItems<T extends Pick<PickItem, 'title' | 'tags'>>(
  items: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...items]
  return items.filter(
    (i) => i.title.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)),
  )
}

/** Where each learner of the item learns it (one entry may learn it more than once). */
export function learnerPositions(item: Pick<PickItem, 'learnings'>): Map<string, Position[]> {
  const out = new Map<string, Position[]>()
  for (const l of item.learnings) {
    const list = out.get(l.entryId)
    if (list) list.push(l.at)
    else out.set(l.entryId, [l.at])
  }
  return out
}

export interface PairUse {
  itemId: string
  entryId: string
  /** Passages in the scene that use the pair. */
  blocks: number
}

/** Knowledge use links of one scene grouped by (item, entry) pair, in first-use order. */
export function groupUsesByPair(links: readonly Link[], sceneId: string): PairUse[] {
  const out = new Map<string, PairUse>()
  for (const l of links) {
    if (l.kind !== KNOWLEDGE_KIND || l.from.item !== sceneId || l.to.entry === undefined) continue
    const key = `${l.to.item}\u0000${l.to.entry}`
    const cur = out.get(key)
    if (cur) cur.blocks++
    else out.set(key, { itemId: l.to.item, entryId: l.to.entry, blocks: 1 })
  }
  return [...out.values()]
}
