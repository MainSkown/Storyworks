import { connect, type GraphRejection } from './graph'
import { TIMELINE_VERSION, type Branch, type Timeline, type TimelineNode } from './schema'

export type OpRejection = GraphRejection | 'missing-branch'
export type OpResult<T = Timeline> = { ok: true; value: T } | { ok: false; reason: OpRejection }

const reject = (reason: OpRejection) => ({ ok: false as const, reason })
const done = (value: Timeline) => ({ ok: true as const, value })

const X_STEP = 260
const Y_STEP = 120

export function newTimeline(id: string, name: string): Timeline {
  return { version: TIMELINE_VERSION, id, name, view: 'flow', branches: [], nodes: [], edges: [] }
}

export interface NewNode {
  id: string
  title?: string
  /** Placed right of this node, on its branch. */
  afterId?: string | null
  /** With `afterId`: also connects afterId -> new node under this edge id. */
  edgeId?: string
}

export function addNode(t: Timeline, o: NewNode): OpResult {
  const after = o.afterId ? t.nodes.find((n) => n.id === o.afterId) : undefined
  if (o.afterId && !after) return reject('missing-node')
  if (t.nodes.some((n) => n.id === o.id)) return reject('duplicate-id')
  const pos = { x: after ? after.pos.x + X_STEP : 0, y: after ? after.pos.y : 0 }
  while (t.nodes.some((n) => Math.abs(n.pos.x - pos.x) < 1 && Math.abs(n.pos.y - pos.y) < 1))
    pos.y += Y_STEP
  const node: TimelineNode = {
    id: o.id,
    title: o.title ?? '',
    description: { type: 'doc', content: [] },
    date: null,
    color: null,
    tag: null,
    branchId: after?.branchId ?? null,
    pos,
    codexIds: [],
    ruleIds: [],
  }
  const next = { ...t, nodes: [...t.nodes, node] }
  if (after && o.edgeId) return connect(next, { id: o.edgeId, from: after.id, to: o.id })
  return done(next)
}

export type NodePatch = Partial<Omit<TimelineNode, 'id'>>

export function updateNode(t: Timeline, id: string, patch: NodePatch): OpResult {
  if (!t.nodes.some((n) => n.id === id)) return reject('missing-node')
  if (patch.branchId && !t.branches.some((b) => b.id === patch.branchId))
    return reject('missing-branch')
  return done({ ...t, nodes: t.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })
}

export function setPositions(t: Timeline, pos: Map<string, { x: number; y: number }>): Timeline {
  return { ...t, nodes: t.nodes.map((n) => (pos.has(n.id) ? { ...n, pos: pos.get(n.id)! } : n)) }
}

export function addBranch(t: Timeline, b: Branch): OpResult {
  if (t.branches.some((x) => x.id === b.id)) return reject('duplicate-id')
  return done({ ...t, branches: [...t.branches, b] })
}

export function updateBranch(t: Timeline, id: string, patch: Partial<Omit<Branch, 'id'>>): OpResult {
  if (!t.branches.some((b) => b.id === id)) return reject('missing-branch')
  return done({ ...t, branches: t.branches.map((b) => (b.id === id ? { ...b, ...patch } : b)) })
}

/** Nodes on the branch move to the main line. */
export function removeBranch(t: Timeline, id: string): OpResult {
  if (!t.branches.some((b) => b.id === id)) return reject('missing-branch')
  return done({
    ...t,
    branches: t.branches.filter((b) => b.id !== id),
    nodes: t.nodes.map((n) => (n.branchId === id ? { ...n, branchId: null } : n)),
  })
}

export const setView = (t: Timeline, view: Timeline['view']): Timeline => ({ ...t, view })
export const renameTimeline = (t: Timeline, name: string): Timeline => ({ ...t, name })

/**
 * Puts a deleted node back at `index` and re-adds each saved edge that still fits
 * (other end exists, no cycle, no duplicate). Edges that do not fit come back as `skipped`.
 * A branch that no longer exists is cleared on the node.
 */
export function reinsertNode(
  t: Timeline,
  node: TimelineNode,
  edges: Timeline['edges'],
  index: number,
): OpResult<{ timeline: Timeline; skipped: Timeline['edges'] }> {
  if (t.nodes.some((n) => n.id === node.id)) return reject('duplicate-id')
  const branchOk = node.branchId === null || t.branches.some((b) => b.id === node.branchId)
  const restored = branchOk ? node : { ...node, branchId: null }
  const nodes = [...t.nodes]
  nodes.splice(Math.min(index, nodes.length), 0, restored)
  let next: Timeline = { ...t, nodes }
  const skipped: Timeline['edges'] = []
  for (const e of edges) {
    const r = connect(next, e)
    if (r.ok) next = r.value
    else skipped.push(e)
  }
  return { ok: true, value: { timeline: next, skipped } }
}
