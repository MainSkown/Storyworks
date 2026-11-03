import { omitKey } from './omit'
import type { CanConnect, GraphEdgeModel, GraphNodeModel } from '../components/graph/types'
import type { Condition, SetOp } from '../project/schemas/condition'
import type {
  Conversation,
  ConversationNode,
  ConversationOption,
} from '../project/schemas/conversation'

export type NodeType = ConversationNode['type']
type Choice = Extract<ConversationNode, { type: 'choice' }>

/** Card size on the canvas (ConversationView draws nodes this big). */
export const NODE_W = 200
export const NODE_H = 72
const X_STEP = 400
const Y_STEP = 120

const withoutLink = <T extends object>(x: T): T => omitKey(x, 'link') as T
const find = (c: Conversation, id: string) => c.nodes.find((n) => n.id === id)
const mapNode = (c: Conversation, id: string, f: (n: ConversationNode) => ConversationNode) => ({
  ...c,
  nodes: c.nodes.map((n) => (n.id === id ? f(n) : n)),
})
const mapChoice = (c: Conversation, id: string, f: (n: Choice) => Choice) =>
  mapNode(c, id, (n) => (n.type === 'choice' ? f(n) : n))

export function toGraph(c: Conversation): {
  nodes: GraphNodeModel<ConversationNode>[]
  edges: GraphEdgeModel[]
} {
  const ids = new Set(c.nodes.map((n) => n.id))
  const edges: GraphEdgeModel[] = []
  const link = (id: string, from: string, to: string | null | undefined, label?: string) => {
    if (to && ids.has(to)) edges.push({ id, from, to, ...(label === undefined ? {} : { label }) })
  }
  for (const n of c.nodes) {
    if (n.type === 'lines') link(`next:${n.id}`, n.id, n.next)
    else if (n.type === 'jump') link(`jump:${n.id}`, n.id, n.target?.nodeId)
    else if (n.type === 'choice')
      for (const o of n.options) link(`opt:${o.id}`, n.id, o.target, o.text)
  }
  return {
    nodes: c.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, label: n.type, data: n })),
    edges,
  }
}

export interface BrokenTarget {
  nodeId: string
  optionId?: string
  targetId: string
}

export function brokenTargets(c: Conversation): BrokenTarget[] {
  const ids = new Set(c.nodes.map((n) => n.id))
  const out: BrokenTarget[] = []
  for (const n of c.nodes) {
    if (n.type === 'lines' && n.next && !ids.has(n.next))
      out.push({ nodeId: n.id, targetId: n.next })
    else if (n.type === 'jump' && n.target && !ids.has(n.target.nodeId))
      out.push({ nodeId: n.id, targetId: n.target.nodeId })
    else if (n.type === 'choice')
      for (const o of n.options)
        if (o.target && !ids.has(o.target))
          out.push({ nodeId: n.id, optionId: o.id, targetId: o.target })
  }
  return out
}

const taken = (c: Conversation, x: number, y: number) =>
  c.nodes.some((n) => Math.abs(n.x - x) < NODE_W && Math.abs(n.y - y) < NODE_H)

/** Right of the focused node, stepping down while taken; else below the lowest node. */
export function placeNew(c: Conversation, afterId: string | null): { x: number; y: number } {
  const after = afterId ? find(c, afterId) : undefined
  if (!after && !c.nodes.length) return { x: 0, y: 0 }
  const lowest = after ? null : c.nodes.reduce((a, b) => (b.y > a.y ? b : a))
  const x = after ? after.x + X_STEP : lowest!.x
  let y = after ? after.y : lowest!.y + Y_STEP
  while (taken(c, x, y)) y += Y_STEP
  return { x, y }
}

export interface NewNode {
  id: string
  x: number
  y: number
  /** Links this node's empty `next`/jump target to the new node. */
  afterId?: string | null
}

export function addNode(c: Conversation, type: NodeType, o: NewNode): Conversation {
  if (find(c, o.id)) return c
  const base = { id: o.id, x: o.x, y: o.y, sets: [] }
  const node: ConversationNode =
    type === 'lines'
      ? { ...base, type, content: { type: 'doc', content: [] }, next: null }
      : type === 'choice'
        ? { ...base, type, options: [] }
        : type === 'jump'
          ? { ...base, type, target: null }
          : { ...base, type }
  let out: Conversation = {
    ...c,
    nodes: [...c.nodes, node],
    startNodeId: c.startNodeId && find(c, c.startNodeId) ? c.startNodeId : node.id,
  }
  const from = o.afterId ? find(c, o.afterId) : undefined
  if (from?.type === 'lines' && !from.next) out = connect(out, from.id, node.id)
  else if (from?.type === 'jump' && !from.target) out = connect(out, from.id, node.id)
  return out
}

export function deleteNode(c: Conversation, id: string): Conversation {
  const nodes = c.nodes
    .filter((n) => n.id !== id)
    .map((n): ConversationNode => {
      if (n.type === 'lines') return n.next === id ? { ...n, next: null } : n
      if (n.type === 'jump') return n.target?.nodeId === id ? { ...n, target: null } : n
      if (n.type === 'choice')
        return {
          ...n,
          options: n.options.map((o) => (o.target === id ? { ...o, target: null } : o)),
        }
      return n
    })
  const startNodeId = c.startNodeId === id ? (nodes[0]?.id ?? null) : c.startNodeId
  return { ...c, nodes, startNodeId }
}

export function canConnect(c: Conversation): CanConnect {
  return (from, to) => {
    const a = find(c, from)
    if (!a || !find(c, to)) return { ok: false, reason: 'unknown-node' }
    if (a.type === 'end') return { ok: false, reason: 'end-no-outgoing' }
    return { ok: true }
  }
}

export interface ConnectOpts {
  /** Choice: retarget this option. */
  optionId?: string
  /** Choice without `optionId`: id of the option to append. */
  newOptionId?: string
}

/** Returns `c` unchanged when the connection is refused. */
export function connect(c: Conversation, fromId: string, toId: string, o: ConnectOpts = {}) {
  if (!canConnect(c)(fromId, toId).ok) return c
  const from = find(c, fromId)!
  if (from.type === 'lines') return mapNode(c, fromId, (n) => ({ ...n, next: toId }) as typeof n)
  if (from.type === 'jump')
    return mapNode(c, fromId, (n) => ({ ...withoutLink(n), target: { nodeId: toId } }) as typeof n)
  if (from.type !== 'choice') return c
  if (o.optionId)
    return from.options.some((x) => x.id === o.optionId)
      ? updateOption(c, fromId, o.optionId, { target: toId })
      : c
  return o.newOptionId ? addOption(c, fromId, { id: o.newOptionId, target: toId }) : c
}

/** Clears the field an edge id (`next:`, `jump:`, `opt:`) names; options stay. */
export function disconnect(c: Conversation, edgeId: string): Conversation {
  const i = edgeId.indexOf(':')
  const kind = edgeId.slice(0, i)
  const key = edgeId.slice(i + 1)
  if (kind === 'next')
    return mapNode(c, key, (n) => (n.type === 'lines' ? { ...n, next: null } : n))
  if (kind === 'jump')
    return mapNode(c, key, (n) => (n.type === 'jump' ? { ...withoutLink(n), target: null } : n))
  if (kind === 'opt')
    return {
      ...c,
      nodes: c.nodes.map((n) =>
        n.type === 'choice' && n.options.some((o) => o.id === key)
          ? {
              ...n,
              options: n.options.map((o) => (o.id === key ? { ...withoutLink(o), target: null } : o)),
            }
          : n,
      ),
    }
  return c
}

const hasOption = (c: Conversation, optionId: string) =>
  c.nodes.some((n) => n.type === 'choice' && n.options.some((o) => o.id === optionId))

export function addOption(
  c: Conversation,
  nodeId: string,
  o: { id: string; text?: string; target?: string | null },
): Conversation {
  if (hasOption(c, o.id)) return c
  const option: ConversationOption = {
    id: o.id,
    text: o.text ?? '',
    target: o.target ?? null,
    sets: [],
  }
  return mapChoice(c, nodeId, (n) => ({ ...n, options: [...n.options, option] }))
}

export function removeOption(c: Conversation, nodeId: string, optionId: string): Conversation {
  return mapChoice(c, nodeId, (n) => ({ ...n, options: n.options.filter((o) => o.id !== optionId) }))
}

/** Moves the option to `index` (clamped). */
export function moveOption(
  c: Conversation,
  nodeId: string,
  optionId: string,
  index: number,
): Conversation {
  return mapChoice(c, nodeId, (n) => {
    const opt = n.options.find((o) => o.id === optionId)
    if (!opt) return n
    const rest = n.options.filter((o) => o !== opt)
    rest.splice(Math.max(0, Math.min(index, rest.length)), 0, opt)
    return { ...n, options: rest }
  })
}

export type OptionPatch = Partial<Pick<ConversationOption, 'text' | 'target' | 'sets'>> & {
  /** `undefined` clears it. */
  condition?: Condition | undefined
}

export function updateOption(
  c: Conversation,
  nodeId: string,
  optionId: string,
  patch: OptionPatch,
): Conversation {
  return mapChoice(c, nodeId, (n) => ({
    ...n,
    options: n.options.map((o) => {
      if (o.id !== optionId) return o
      const next = { ...o, ...patch, id: o.id }
      return patch.target ? withoutLink(next) : next
    }),
  }))
}

export function setStart(c: Conversation, id: string): Conversation {
  return find(c, id) ? { ...c, startNodeId: id } : c
}

export function moveNode(c: Conversation, id: string, x: number, y: number): Conversation {
  return mapNode(c, id, (n) => ({ ...n, x, y }))
}

export function setNodeCondition(
  c: Conversation,
  id: string,
  condition: Condition | undefined,
): Conversation {
  return mapNode(c, id, (n) => ({ ...n, condition }))
}

export function setNodeSets(c: Conversation, id: string, sets: SetOp[]): Conversation {
  return mapNode(c, id, (n) => ({ ...n, sets }))
}
