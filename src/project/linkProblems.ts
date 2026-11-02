import { CODEX_KIND, KNOWLEDGE_KIND, type Link } from './links'

/** Plain text of one block (by id) of ProseMirror-style content, shortened to `max` chars; null when the block is gone. */
export function blockSnippet(content: unknown, blockId: string, max = 110): string | null {
  const block = findBlock(content, blockId)
  if (!block) return null
  const text = textOf(block).replace(/\s+/g, ' ').trim()
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

interface PmNode {
  type?: string
  text?: string
  attrs?: { id?: unknown }
  content?: unknown
}

function findBlock(node: unknown, id: string): PmNode | null {
  if (typeof node !== 'object' || node === null) return null
  const n = node as PmNode
  if (n.attrs?.id === id) return n
  if (Array.isArray(n.content)) {
    for (const child of n.content) {
      const hit = findBlock(child, id)
      if (hit) return hit
    }
  }
  return null
}

function textOf(node: PmNode): string {
  if (node.type === 'footnote') return ''
  if (typeof node.text === 'string') return node.text
  return Array.isArray(node.content) ? node.content.map((c) => textOf(c as PmNode)).join('') : ''
}

export interface LinkProblem {
  link: Link
  targetMissing: boolean
  passageMissing: boolean
  /** Only a missing event can be relinked; a missing passage can only be removed. */
  canRelink: boolean
  /** What to tell the writer (picks the text): the passage wins over the target. */
  reason: 'passage-missing' | 'node-missing' | 'entry-missing' | 'knowledge-missing'
}

export function buildProblems(
  links: readonly Link[],
  check: { targetMissing: (l: Link) => boolean; passageMissing: (l: Link) => boolean },
): LinkProblem[] {
  const out: LinkProblem[] = []
  for (const link of links) {
    const targetMissing = check.targetMissing(link)
    const passageMissing = check.passageMissing(link)
    if (targetMissing || passageMissing)
      out.push({
        link,
        targetMissing,
        passageMissing,
        canRelink: targetMissing && !passageMissing,
        reason: passageMissing
          ? 'passage-missing'
          : link.kind === KNOWLEDGE_KIND
            ? 'knowledge-missing'
            : link.kind === CODEX_KIND
              ? 'entry-missing'
              : 'node-missing',
      })
  }
  return out
}

/** Target side gone: an event link needs its node, a codex or knowledge link only live targets. */
export function linkTargetMissing(
  link: Link,
  deps: { isBroken: (l: Link) => boolean; nodeExists: (l: Link) => boolean },
): boolean {
  return (
    deps.isBroken(link) ||
    (link.kind !== CODEX_KIND && link.kind !== KNOWLEDGE_KIND && !deps.nodeExists(link))
  )
}
