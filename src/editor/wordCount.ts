import type { ManuscriptNode } from '../project/schemas/manifest'

interface DocNode {
  type?: string
  text?: string
  content?: DocNode[]
}

const INLINE = new Set(['text', 'footnote', 'hardBreak'])

function inlineText(nodes: DocNode[]): string {
  let out = ''
  for (const n of nodes) {
    if (n.type === 'text') out += n.text ?? ''
    else if (n.type === 'hardBreak') out += ' '
  }
  return out
}

function words(text: string): number {
  const t = text.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}

/** Words in a TipTap doc; footnote bodies, images and breaks count 0. */
export function countWords(doc: unknown): number {
  const walk = (node: DocNode): number => {
    const kids = node.content
    if (!Array.isArray(kids)) return 0
    if (kids.every((k) => INLINE.has(k.type ?? ''))) return words(inlineText(kids))
    return kids.reduce((sum, k) => sum + walk(k), 0)
  }
  return doc && typeof doc === 'object' ? walk(doc as DocNode) : 0
}

/** Words per node id (scenes and conversations own count, containers sum); book total under ''. */
export function rollUp(
  tree: ManuscriptNode[],
  sceneCounts: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>()
  const walk = (node: ManuscriptNode): number => {
    const total =
      node.type === 'scene' || node.type === 'conversation'
        ? (sceneCounts.get(node.id) ?? 0)
        : node.children.reduce((sum, c) => sum + walk(c), 0)
    out.set(node.id, total)
    return total
  }
  out.set(
    '',
    tree.reduce((sum, n) => sum + walk(n), 0),
  )
  return out
}
