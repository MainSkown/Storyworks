import type { TextRange } from './mentions'

export interface Segment {
  text: string
  hit: boolean
}

/**
 * The block text cut into plain and matched parts. A long text is trimmed to a window of about
 * `max` characters around the first match (with "…" at cut edges); ranges the window cuts are dropped.
 */
export function mentionSegments(text: string, ranges: readonly TextRange[], max = 180): Segment[] {
  let from = 0
  let to = text.length
  if (text.length > max && ranges.length > 0) {
    const first = ranges[0]
    from = Math.max(0, first.start - Math.floor((max - (first.end - first.start)) / 3))
    to = Math.min(text.length, from + max)
    from = Math.max(0, Math.min(from, to - max))
  }
  const out: Segment[] = []
  const push = (s: string, hit: boolean) => s && out.push({ text: s, hit })
  if (from > 0) push('…', false)
  let at = from
  for (const r of ranges) {
    if (r.start < at || r.end > to) continue
    push(text.slice(at, r.start), false)
    push(text.slice(r.start, r.end), true)
    at = r.end
  }
  push(text.slice(at, to), false)
  if (to < text.length) push('…', false)
  return out
}
