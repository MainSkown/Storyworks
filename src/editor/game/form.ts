/** A game scene file is either a script (lines) or a text item (prose); the body tells which. */
export type SceneForm = 'script' | 'text'

export function formOfContent(content: Record<string, unknown>): SceneForm {
  const first = Array.isArray(content.content)
    ? (content.content[0] as { type?: unknown } | undefined)
    : undefined
  return typeof first?.type === 'string' && first.type !== 'line' ? 'text' : 'script'
}
