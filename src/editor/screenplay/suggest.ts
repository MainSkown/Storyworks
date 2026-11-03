import { fold } from '../../search/normalize'

export type SuggestLang = 'en' | 'pl'

export interface NamedEntry {
  name: string
  aliases: string[]
}

export interface SuggestSource {
  lang: SuggestLang
  characters: NamedEntry[]
  places: NamedEntry[]
}

export interface Suggestion {
  /** Shown in the list. */
  label: string
  /** Text that replaces `from..end` of the block when accepted. */
  insert: string
  /** The alias that matched, when the name itself did not. */
  via?: string
}

export interface SuggestResult {
  items: Suggestion[]
  /** Offset in the block text where `insert` starts replacing. */
  from: number
  /** Cue name that is not in the codex (offer "Add to codex"). */
  addName: string | null
}

export type SuggestBlock = 'character' | 'sceneHeading'

export const TIMES: Record<SuggestLang, readonly string[]> = {
  en: ['DAY', 'NIGHT', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER'],
  pl: ['DZIEŃ', 'NOC', 'ŚWIT', 'ZMIERZCH', 'CIĄGLE', 'PÓŹNIEJ'],
}

const PREFIXES = ['INT.', 'EXT.', 'INT./EXT.']
const PREFIX_DONE = /^(int\.\/ext\.|int\.|ext\.)\s/i
const NONE: SuggestResult = { items: [], from: 0, addName: null }

/** Candidates whose fold starts with the query, then those that contain it; an exact match is dropped. */
function rank(
  query: string,
  candidates: { label: string; keys: string[]; insert: string }[],
): Suggestion[] {
  const q = fold(query.trim())
  const starts: Suggestion[] = []
  const inside: Suggestion[] = []
  for (const c of candidates) {
    if (q !== '' && c.keys.some((k) => fold(k) === q)) continue
    let best: { rank: 0 | 1; via?: string } | null = null
    for (const [i, key] of c.keys.entries()) {
      const at = q === '' ? 0 : fold(key).indexOf(q)
      if (at < 0) continue
      const rank = at === 0 ? 0 : 1
      if (!best || rank < best.rank) best = { rank, via: i === 0 ? undefined : key }
    }
    if (!best) continue
    const s: Suggestion = {
      label: c.label,
      insert: c.insert,
      ...(best.via ? { via: best.via } : {}),
    }
    ;(best.rank === 0 ? starts : inside).push(s)
  }
  return [...starts, ...inside]
}

function characterCue(text: string, src: SuggestSource): SuggestResult {
  const q = text.trim()
  if (q === '' || q.includes('(')) return NONE
  const items = rank(
    q,
    src.characters.map((c) => ({ label: c.name, keys: [c.name, ...c.aliases], insert: c.name })),
  )
  const known = src.characters.some((c) => [c.name, ...c.aliases].some((k) => fold(k) === fold(q)))
  return { items, from: 0, addName: known ? null : q }
}

function sceneHeading(text: string, src: SuggestSource): SuggestResult {
  const dash = text.lastIndexOf(' - ')
  if (dash >= 0) {
    const from = dash + 3
    const items = rank(
      text.slice(from),
      TIMES[src.lang].map((t) => ({ label: t, keys: [t], insert: t })),
    )
    return { items, from, addName: null }
  }
  const done = PREFIX_DONE.exec(text)
  if (done) {
    const from = done[0].length
    const items = rank(
      text.slice(from),
      src.places.map((p) => ({
        label: p.name,
        keys: [p.name, ...p.aliases],
        insert: `${p.name} - `,
      })),
    )
    return { items, from, addName: null }
  }
  if (text.trim() === '') return NONE
  const items = rank(
    text,
    PREFIXES.map((p) => ({ label: p, keys: [p], insert: `${p} ` })),
  ).filter((i) => fold(i.label).startsWith(fold(text.trim())))
  return { items, from: 0, addName: null }
}

/** Suggestions for the text of a character cue or scene heading block. Free text is always allowed. */
export function suggest(type: SuggestBlock, text: string, src: SuggestSource): SuggestResult {
  return type === 'character' ? characterCue(text, src) : sceneHeading(text, src)
}

const CHARACTER_TYPES = ['character', 'postac']
const PLACE_TYPES = ['place', 'miejsce']

/** Characters and places from the codex, found by the starter type names (either language). */
export function sourceFromCodex(
  types: readonly { id: string; name: string }[],
  entries: readonly { typeId: string; name: string; aliases: string[] }[],
  lang: SuggestLang,
): SuggestSource & { characterTypeId: string | undefined } {
  const idsOf = (names: string[]) =>
    new Set(types.filter((t) => names.includes(fold(t.name.trim()))).map((t) => t.id))
  const chars = idsOf(CHARACTER_TYPES)
  const places = idsOf(PLACE_TYPES)
  const pick = (ids: Set<string>) =>
    entries
      .filter((e) => ids.has(e.typeId) && e.name.trim() !== '')
      .map((e) => ({ name: e.name.trim(), aliases: e.aliases.filter((a) => a.trim() !== '') }))
  return { lang, characters: pick(chars), places: pick(places), characterTypeId: [...chars][0] }
}
