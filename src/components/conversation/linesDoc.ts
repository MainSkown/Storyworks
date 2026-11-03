/** An empty or missing body is shown as one empty line (the schema allows an empty doc). */
export function toEditorContent(content: Record<string, unknown> | undefined): Record<string, unknown> {
  const list = content?.content
  if (!content || !Array.isArray(list) || list.length === 0)
    return { type: 'doc', content: [{ type: 'line' }] }
  return content
}

export function docsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
