/** The codex speaker id of every line that has one, in order (repeats kept). */
export function speakerIdsOf(content: Record<string, unknown>): string[] {
  const kids = Array.isArray(content.content) ? (content.content as unknown[]) : []
  const out: string[] = []
  for (const k of kids) {
    const n = k as { type?: unknown; attrs?: { speakerId?: unknown } }
    if (n?.type === 'line' && typeof n.attrs?.speakerId === 'string' && n.attrs.speakerId)
      out.push(n.attrs.speakerId)
  }
  return out
}
