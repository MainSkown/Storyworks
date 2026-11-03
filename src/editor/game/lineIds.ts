import { isLineId } from './validate'

export const formatLineId = (n: number): string => `L${String(n).padStart(6, '0')}`

export const parseLineId = (id: unknown): number | null =>
  isLineId(id) ? Number(id.slice(1)) : null

/** Highest line number in a script body, 0 when it has no lines. */
export function maxLineNumber(content: Record<string, unknown>): number {
  const kids = Array.isArray(content.content) ? (content.content as unknown[]) : []
  let max = 0
  for (const k of kids) {
    const n = k as { type?: unknown; attrs?: { lineId?: unknown } }
    if (n?.type !== 'line') continue
    max = Math.max(max, parseLineId(n.attrs?.lineId) ?? 0)
  }
  return max
}
