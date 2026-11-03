import { fold } from '../../search/normalize'

export interface SpeakerEntry {
  id: string
  name: string
  aliases: string[]
}

export type SpeakerView =
  | { state: 'none' }
  | { state: 'name'; name: string }
  | { state: 'entry'; id: string; name: string }
  | { state: 'broken'; id: string }

/** What a line's speaker attrs mean right now: the codex name is looked up live, never copied. */
export function resolveSpeaker(
  attrs: { speakerId?: string | null; speakerName?: string | null },
  byId: (id: string) => SpeakerEntry | undefined,
): SpeakerView {
  if (attrs.speakerId) {
    const e = byId(attrs.speakerId)
    return e ? { state: 'entry', id: e.id, name: e.name } : { state: 'broken', id: attrs.speakerId }
  }
  if (attrs.speakerName) return { state: 'name', name: attrs.speakerName }
  return { state: 'none' }
}

export interface RankedSpeaker {
  entry: SpeakerEntry
  /** The alias that matched, when the name did not. */
  via?: string
}

/** Picker order: no query = recent speakers, then the rest by name; a query ranks prefix before substring. */
export function rankSpeakers(
  query: string,
  entries: readonly SpeakerEntry[],
  recent: readonly string[],
): RankedSpeaker[] {
  const q = fold(query.trim())
  if (q === '') {
    const rank = new Map(recent.map((id, i) => [id, i]))
    const byName = (a: SpeakerEntry, b: SpeakerEntry) => a.name.localeCompare(b.name)
    const seen = entries
      .filter((e) => rank.has(e.id))
      .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
    const rest = entries.filter((e) => !rank.has(e.id)).sort(byName)
    return [...seen, ...rest].map((entry) => ({ entry }))
  }
  const groups: RankedSpeaker[][] = [[], [], []]
  for (const entry of entries) {
    let best: { group: number; via?: string } | null = null
    for (const [i, key] of [entry.name, ...entry.aliases].entries()) {
      const at = fold(key).indexOf(q)
      if (at < 0) continue
      const group = at === 0 ? (i === 0 ? 0 : 1) : 2
      if (!best || group < best.group) best = { group, via: i === 0 ? undefined : key }
    }
    if (best) groups[best.group]!.push({ entry, ...(best.via ? { via: best.via } : {}) })
  }
  return groups.flat()
}

/** True when the text is exactly a codex name or alias. */
export function isKnownName(text: string, entries: readonly SpeakerEntry[]): boolean {
  const q = fold(text.trim())
  return q !== '' && entries.some((e) => [e.name, ...e.aliases].some((k) => fold(k.trim()) === q))
}

/** Distinct codex speakers used in a script, the most recent line first. */
export function recentSpeakers(content: Record<string, unknown>, max = 8): string[] {
  const kids = Array.isArray(content.content) ? (content.content as unknown[]) : []
  const out: string[] = []
  for (let i = kids.length - 1; i >= 0 && out.length < max; i--) {
    const id = (kids[i] as { attrs?: { speakerId?: unknown } })?.attrs?.speakerId
    if (typeof id === 'string' && id && !out.includes(id)) out.push(id)
  }
  return out
}

const CHARACTER_TYPES = ['character', 'postac']

/** Codex characters (found by the starter type names, either language) for the picker. */
export function characterSpeakers(
  types: readonly { id: string; name: string }[],
  entries: readonly { id: string; typeId: string; name: string; aliases: string[] }[],
): { list: SpeakerEntry[]; characterTypeId: string | undefined } {
  const ids = new Set(
    types.filter((t) => CHARACTER_TYPES.includes(fold(t.name.trim()))).map((t) => t.id),
  )
  return {
    list: entries
      .filter((e) => ids.has(e.typeId) && e.name.trim() !== '')
      .map((e) => ({
        id: e.id,
        name: e.name.trim(),
        aliases: e.aliases.filter((a) => a.trim() !== ''),
      })),
    characterTypeId: [...ids][0],
  }
}
