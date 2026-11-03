import { omitKey } from './omit'
import type { Conversation, ConversationNode, ItemLink } from '../project/schemas/conversation'

export type LinkBroken = 'item-missing' | 'item-trashed' | 'node-missing'
export type LinkResolution = { ok: true } | { ok: false; reason: LinkBroken }

/** What the resolver needs to know about the project's items. */
export interface LinkContext {
  /** null = no such item (not in the tree and not in the trash). */
  item(id: string): { type: 'scene' | 'conversation'; trashed: boolean } | null
  /** Node ids of a conversation; null when it is not loaded (the node is then not judged). */
  nodeIds(conversationId: string): ReadonlySet<string> | null
}

export function resolveLink(link: ItemLink, ctx: LinkContext): LinkResolution {
  const item = ctx.item(link.itemId)
  if (!item) return { ok: false, reason: 'item-missing' }
  if (item.trashed) return { ok: false, reason: 'item-trashed' }
  if (item.type === 'conversation' && link.nodeId !== undefined) {
    const ids = ctx.nodeIds(link.itemId)
    if (ids && !ids.has(link.nodeId)) return { ok: false, reason: 'node-missing' }
  }
  return { ok: true }
}

export interface LinkSource {
  nodeId: string
  optionId?: string
  link: ItemLink
}

/** Every cross-item link of a conversation, in node and option order. */
export function linksOf(c: Conversation): LinkSource[] {
  const out: LinkSource[] = []
  for (const n of c.nodes) {
    if (n.type === 'jump' && n.link) out.push({ nodeId: n.id, link: n.link })
    else if (n.type === 'choice')
      for (const o of n.options) if (o.link) out.push({ nodeId: n.id, optionId: o.id, link: o.link })
  }
  return out
}

export type LinkProblem = LinkSource & { reason: LinkBroken }

export function linkProblems(c: Conversation, ctx: LinkContext): LinkProblem[] {
  const out: LinkProblem[] = []
  for (const s of linksOf(c)) {
    const r = resolveLink(s.link, ctx)
    if (!r.ok) out.push({ ...s, reason: r.reason })
  }
  return out
}

const mapNode = (c: Conversation, id: string, f: (n: ConversationNode) => ConversationNode) => ({
  ...c,
  nodes: c.nodes.map((n) => (n.id === id ? f(n) : n)),
})

/** Sets (or, with null, clears) a jump's link; setting one clears its node target. */
export function setJumpLink(c: Conversation, nodeId: string, link: ItemLink | null): Conversation {
  const n = c.nodes.find((x) => x.id === nodeId)
  if (n?.type !== 'jump') return c
  return mapNode(c, nodeId, (x) => {
    if (x.type !== 'jump') return x
    const rest = omitKey(x, 'link')
    return link ? { ...rest, target: null, link } : rest
  })
}

/** Sets (or, with null, clears) an option's link; setting one clears its node target. */
export function setOptionLink(
  c: Conversation,
  nodeId: string,
  optionId: string,
  link: ItemLink | null,
): Conversation {
  const n = c.nodes.find((x) => x.id === nodeId)
  if (n?.type !== 'choice' || !n.options.some((o) => o.id === optionId)) return c
  return mapNode(c, nodeId, (x) =>
    x.type !== 'choice'
      ? x
      : {
          ...x,
          options: x.options.map((o) => {
            if (o.id !== optionId) return o
            const rest = omitKey(o, 'link')
            return link ? { ...rest, target: null, link } : rest
          }),
        },
  )
}
