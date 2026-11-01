/** Ids of every comment mark in a ProseMirror-style JSON tree. */
export function commentIdsIn(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof node !== 'object' || node === null) return out
  const n = node as { marks?: unknown; content?: unknown }
  if (Array.isArray(n.marks)) {
    for (const m of n.marks as Array<{ type?: string; attrs?: { commentId?: unknown } }>) {
      if (m?.type === 'comment' && typeof m.attrs?.commentId === 'string')
        out.add(m.attrs.commentId)
    }
  }
  if (Array.isArray(n.content)) for (const c of n.content) commentIdsIn(c, out)
  return out
}

interface DocLike {
  descendants(
    f: (
      node: { isText: boolean; marks: readonly MarkLike[]; nodeSize: number },
      pos: number,
    ) => void,
  ): void
}
interface MarkLike {
  type: { name: string }
  attrs: Record<string, unknown>
}

/** Text range covered by each comment mark in a live ProseMirror doc (gaps are spanned). */
export function commentRanges(doc: DocLike): Map<string, { from: number; to: number }> {
  const out = new Map<string, { from: number; to: number }>()
  doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const m of node.marks) {
      const id = m.type.name === 'comment' ? m.attrs.commentId : null
      if (typeof id !== 'string') continue
      const r = out.get(id)
      if (r) {
        r.from = Math.min(r.from, pos)
        r.to = Math.max(r.to, pos + node.nodeSize)
      } else out.set(id, { from: pos, to: pos + node.nodeSize })
    }
  })
  return out
}
