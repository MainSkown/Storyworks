/**
 * Matching fold: lowercase, no diacritics, and `ł`→`l` (it does not decompose).
 * Folding can change the length (decomposed accents are dropped), so `foldMapped` also
 * records where each folded character came from; `originalRange` turns a match back into
 * offsets in the original text.
 */

const MARKS = /\p{M}/gu
const cache = new Map<string, string>()

function foldChar(ch: string): string {
  let f = cache.get(ch)
  if (f === undefined) {
    f = ch.normalize('NFD').replace(MARKS, '').toLowerCase().replace(/ł/g, 'l')
    cache.set(ch, f)
  }
  return f
}

const isAscii = (text: string) => /^\p{ASCII}*$/u.test(text)

export interface Folded {
  folded: string
  /** Per folded character: where its source character starts and ends in the original. Null when lengths are unchanged. */
  starts: number[] | null
  ends: number[] | null
}

export function fold(text: string): string {
  return foldMapped(text, false).folded
}

export function foldMapped(text: string, withMap = true): Folded {
  if (isAscii(text)) return { folded: text.toLowerCase(), starts: null, ends: null }
  let folded = ''
  const starts: number[] = []
  const ends: number[] = []
  let same = true
  let i = 0
  for (const ch of text) {
    const f = foldChar(ch)
    if (f.length !== ch.length) same = false
    folded += f
    if (withMap) {
      for (let k = 0; k < f.length; k++) {
        starts.push(i)
        ends.push(i + ch.length)
      }
    }
    i += ch.length
  }
  return same || !withMap ? { folded, starts: null, ends: null } : { folded, starts, ends }
}

/** Offsets in the original text for the folded range [start, end). */
export function originalRange(
  text: string,
  m: Folded,
  start: number,
  end: number,
): { start: number; end: number } {
  if (!m.starts || !m.ends) return { start, end }
  const s = m.starts[start]
  // Take dropped marks that follow the match; never end inside a source character.
  const e = end < m.folded.length ? Math.max(m.starts[end], m.ends[end - 1]) : text.length
  return { start: s, end: e }
}
