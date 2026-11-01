import { compareDates, type Calendar, type CalendarDate } from '../calendar'
import type { GraphEdge } from './graph'

export type Order = 'before' | 'after' | 'equal' | 'unknown'

export type Position = { node: { timelineId: string; nodeId: string } } | { date: CalendarDate }

/** The part of a timeline the helper reads. */
export interface OrderTimeline {
  nodes: { id: string; date?: CalendarDate | null }[]
  edges: GraphEdge[]
}

export interface OrderContext {
  calendar: Calendar
  timeline: (id: string) => OrderTimeline | undefined
}

/**
 * Reachability is cached per `edges` array and node lookups per `nodes` array.
 * Timelines must be replaced, not mutated in place, for changes to be seen.
 */
const reachCache = new WeakMap<GraphEdge[], { next: Map<string, string[]>; from: Map<string, Set<string>> }>()
const nodeCache = new WeakMap<OrderTimeline['nodes'], Map<string, OrderTimeline['nodes'][number]>>()

function nodeIndex(t: OrderTimeline) {
  let idx = nodeCache.get(t.nodes)
  if (!idx) {
    idx = new Map(t.nodes.map((n) => [n.id, n]))
    nodeCache.set(t.nodes, idx)
  }
  return idx
}

/** True when an edge path leads from `a` to `b` (a !== b). */
function hasPath(t: OrderTimeline, a: string, b: string): boolean {
  let c = reachCache.get(t.edges)
  if (!c) {
    const next = new Map<string, string[]>()
    for (const e of t.edges) {
      const list = next.get(e.from)
      if (list) list.push(e.to)
      else next.set(e.from, [e.to])
    }
    c = { next, from: new Map() }
    reachCache.set(t.edges, c)
  }
  let seen = c.from.get(a)
  if (!seen) {
    seen = new Set()
    const stack = [a]
    while (stack.length) {
      for (const n of c.next.get(stack.pop() as string) ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          stack.push(n)
        }
      }
    }
    c.from.set(a, seen)
  }
  return seen.has(b)
}

/** Resolves a position to its date (null when undated) and, for nodes, whether the node exists. */
function resolve(p: Position, ctx: OrderContext) {
  if ('date' in p) return { date: p.date, timeline: null, exists: true }
  const timeline = ctx.timeline(p.node.timelineId)
  const node = timeline ? nodeIndex(timeline).get(p.node.nodeId) : undefined
  return {
    date: node?.date ?? null,
    timeline: timeline ?? null,
    exists: !!node,
  }
}

/**
 * Chronological order of two positions. Both dated and valid: calendar order (wins over the
 * path). Otherwise, on the same timeline, edge path order. Otherwise 'unknown'; never guesses.
 */
export function compare(a: Position, b: Position, ctx: OrderContext): Order {
  const ra = resolve(a, ctx)
  const rb = resolve(b, ctx)

  if (ra.date && rb.date) {
    const c = compareDates(ctx.calendar, ra.date, rb.date)
    if (c !== null) return c < 0 ? 'before' : c > 0 ? 'after' : 'equal'
  }

  if (!('node' in a) || !('node' in b) || !ra.exists || !rb.exists) return 'unknown'
  if (a.node.timelineId !== b.node.timelineId || !ra.timeline) return 'unknown'
  if (a.node.nodeId === b.node.nodeId) return 'equal'
  if (hasPath(ra.timeline, a.node.nodeId, b.node.nodeId)) return 'before'
  if (hasPath(ra.timeline, b.node.nodeId, a.node.nodeId)) return 'after'
  return 'unknown'
}

/** True only when `a` is known to come strictly before `b`. */
export const isBefore = (a: Position, b: Position, ctx: OrderContext) => compare(a, b, ctx) === 'before'
