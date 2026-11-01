/** Minimal graph shape the pure rules need; timelines and later graphs both fit it. */
export interface GraphData {
  nodes: { id: string }[]
  edges: { id: string; from: string; to: string }[]
}

export type GraphEdge = GraphData['edges'][number]

export type GraphRejection =
  'self' | 'missing-node' | 'missing-edge' | 'duplicate' | 'duplicate-id' | 'cycle'

export type GraphResult<T> = { ok: true; value: T } | { ok: false; reason: GraphRejection }

const reject = (reason: GraphRejection) => ({ ok: false as const, reason })

function successors(edges: GraphEdge[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const e of edges) {
    const list = out.get(e.from)
    if (list) list.push(e.to)
    else out.set(e.from, [e.to])
  }
  return out
}

/** True when `target` can already reach `start` (or they are equal). */
function reaches(edges: GraphEdge[], start: string, target: string): boolean {
  if (start === target) return true
  const next = successors(edges)
  const seen = new Set([start])
  const stack = [start]
  while (stack.length) {
    for (const n of next.get(stack.pop() as string) ?? []) {
      if (n === target) return true
      if (!seen.has(n)) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  return false
}

/** Adding from -> to closes a loop when `from` is already reachable from `to`. */
export function wouldCreateCycle(g: GraphData, from: string, to: string): boolean {
  return reaches(g.edges, to, from)
}

/** True when the edge list contains a directed cycle (Kahn's algorithm). */
export function hasCycle(nodeIds: string[], edges: GraphEdge[]): boolean {
  const indegree = new Map(nodeIds.map((id) => [id, 0]))
  for (const e of edges) indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1)
  const next = successors(edges)
  const queue = [...indegree].filter(([, d]) => d === 0).map(([id]) => id)
  let visited = 0
  while (queue.length) {
    visited++
    for (const n of next.get(queue.pop() as string) ?? []) {
      const d = (indegree.get(n) as number) - 1
      indegree.set(n, d)
      if (d === 0) queue.push(n)
    }
  }
  return visited < indegree.size
}

export function connect<T extends GraphData>(g: T, edge: GraphEdge): GraphResult<T> {
  if (edge.from === edge.to) return reject('self')
  const ids = new Set(g.nodes.map((n) => n.id))
  if (!ids.has(edge.from) || !ids.has(edge.to)) return reject('missing-node')
  if (g.edges.some((e) => e.id === edge.id)) return reject('duplicate-id')
  if (g.edges.some((e) => e.from === edge.from && e.to === edge.to)) return reject('duplicate')
  if (wouldCreateCycle(g, edge.from, edge.to)) return reject('cycle')
  return { ok: true, value: { ...g, edges: [...g.edges, edge] } }
}

export function disconnect<T extends GraphData>(g: T, edgeId: string): GraphResult<T> {
  if (!g.edges.some((e) => e.id === edgeId)) return reject('missing-edge')
  return { ok: true, value: { ...g, edges: g.edges.filter((e) => e.id !== edgeId) } }
}

/** Removes the node and every edge touching it. */
export function removeNode<T extends GraphData>(g: T, nodeId: string): GraphResult<T> {
  if (!g.nodes.some((n) => n.id === nodeId)) return reject('missing-node')
  return {
    ok: true,
    value: {
      ...g,
      nodes: g.nodes.filter((n) => n.id !== nodeId),
      edges: g.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    },
  }
}
