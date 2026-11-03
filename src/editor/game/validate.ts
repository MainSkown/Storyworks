export const LINE_TYPE = 'line'
const LINE_ID = /^L\d{6,}$/

export const isLineId = (v: unknown): v is string => typeof v === 'string' && LINE_ID.test(v)

const optString = (v: unknown) => v === undefined || v === null || typeof v === 'string'

/**
 * What is wrong with a game script body, or null. Docs without `line` blocks (books,
 * screenplays) are not checked; once a doc has lines it may hold nothing else.
 */
export function gameContentProblem(content: Record<string, unknown>): string | null {
  const children = Array.isArray(content.content) ? (content.content as unknown[]) : []
  const type = (c: unknown) => (c as { type?: unknown } | null)?.type
  if (!children.some((c) => type(c) === LINE_TYPE)) return null
  const seen = new Set<string>()
  for (const c of children) {
    if (type(c) !== LINE_TYPE) return String(type(c))
    const attrs = (c as { attrs?: Record<string, unknown> }).attrs ?? {}
    if (!isLineId(attrs.lineId)) return `bad line id ${JSON.stringify(attrs.lineId)}`
    if (seen.has(attrs.lineId)) return `duplicate line id ${attrs.lineId}`
    seen.add(attrs.lineId)
    if (!optString(attrs.speakerId) || !optString(attrs.speakerName))
      return `bad speaker on ${attrs.lineId}`
    if (attrs.speakerId && attrs.speakerName) return `two speakers on ${attrs.lineId}`
  }
  return null
}
