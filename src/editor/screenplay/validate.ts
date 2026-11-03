import { isElement } from './rules'

/** Type of the first top-level node that is not a script element, or null when the content is fine. */
export function screenplayContentProblem(content: Record<string, unknown>): string | null {
  if (content.type !== 'doc') return String(content.type)
  const children = Array.isArray(content.content) ? (content.content as { type?: unknown }[]) : []
  for (const c of children)
    if (typeof c?.type !== 'string' || !isElement(c.type)) return String(c?.type)
  return null
}
