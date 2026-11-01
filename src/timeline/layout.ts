import type { TimelineDate } from './schema'

export interface Point {
  x: number
  y: number
}

export interface LayoutNode {
  id: string
  branchId?: string | null
  date?: TimelineDate | null
}

interface LayoutEdge {
  from: string
  to: string
}

export interface TidyOptions {
  xGap?: number
  yGap?: number
}

/**
 * Layered flow layout: layer = longest path from a source, x by layer, rows ordered by the
 * mean row of their parents (input order breaks ties). Every node is placed, even on a cycle.
 */
export function tidyLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  { xGap = 260, yGap = 120 }: TidyOptions = {},
): Map<string, Point> {
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  const indegree = new Map(nodes.map((n) => [n.id, 0]))
  for (const e of edges) {
    if (e.from === e.to || !index.has(e.from) || !index.has(e.to)) continue
    parents.set(e.to, [...(parents.get(e.to) ?? []), e.from])
    children.set(e.from, [...(children.get(e.from) ?? []), e.to])
    indegree.set(e.to, (indegree.get(e.to) as number) + 1)
  }

  const layer = new Map<string, number>()
  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id)
  for (const id of queue) layer.set(id, 0)
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]
    for (const c of children.get(id) ?? []) {
      layer.set(c, Math.max(layer.get(c) ?? 0, (layer.get(id) as number) + 1))
      indegree.set(c, (indegree.get(c) as number) - 1)
      if (indegree.get(c) === 0) queue.push(c)
    }
  }
  const stuck = nodes.filter((n) => !layer.has(n.id))
  const lastLayer = Math.max(-1, ...layer.values()) + 1
  for (const n of stuck) layer.set(n.id, lastLayer)

  const byLayer: string[][] = []
  for (const n of nodes) (byLayer[layer.get(n.id) as number] ??= []).push(n.id)

  const row = new Map<string, number>()
  const out = new Map<string, Point>()
  byLayer.forEach((ids, l) => {
    const key = (id: string) => {
      const rows = (parents.get(id) ?? [])
        .filter((p) => row.has(p))
        .map((p) => row.get(p) as number)
      return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Infinity
    }
    const sorted = [...ids].sort(
      (a, b) => key(a) - key(b) || (index.get(a) as number) - (index.get(b) as number),
    )
    // Infinity - Infinity is NaN; fall back to input order for parentless nodes.
    sorted.sort((a, b) => {
      const d = key(a) === key(b) ? 0 : key(a) - key(b)
      return Number.isNaN(d) ? 0 : d || (index.get(a) as number) - (index.get(b) as number)
    })
    sorted.forEach((id, r) => {
      row.set(id, r)
      out.set(id, { x: l * xGap, y: r * yGap })
    })
  })
  return out
}

export interface Lane {
  /** 'main', a branch id, or 'undated'. */
  key: string
  branchId: string | null
  y: number
  height: number
}

export interface DatePlacement {
  positions: Map<string, Point>
  laneOf: Map<string, string>
  lanes: Lane[]
  /** Smallest and largest ordinal among placed dated nodes; null when none. */
  range: { min: number; max: number } | null
}

export interface DateOptions {
  width?: number
  rowGap?: number
  minGap?: number
}

/**
 * Date-scaled placement: x from the calendar ordinal, y from the branch lane. Nodes without a
 * date, or whose date `ordinalOf` rejects, go to a trailing 'undated' lane. Nothing is dropped.
 */
export function datePlacement(
  nodes: LayoutNode[],
  branches: { id: string }[],
  ordinalOf: (date: TimelineDate) => number | null,
  { width = 1200, rowGap = 100, minGap = 180 }: DateOptions = {},
): DatePlacement {
  const branchIds = new Set(branches.map((b) => b.id))
  const laneKeys = ['main', ...branches.map((b) => b.id)]
  const dated = new Map<string, { id: string; ord: number }[]>(laneKeys.map((k) => [k, []]))
  const undated: string[] = []
  const laneOf = new Map<string, string>()

  for (const n of nodes) {
    const ord = n.date ? ordinalOf(n.date) : null
    if (ord === null) {
      undated.push(n.id)
      laneOf.set(n.id, 'undated')
      continue
    }
    const key = n.branchId && branchIds.has(n.branchId) ? n.branchId : 'main'
    dated.get(key)!.push({ id: n.id, ord })
    laneOf.set(n.id, key)
  }

  const all = [...dated.values()].flat()
  const range = all.length
    ? { min: Math.min(...all.map((d) => d.ord)), max: Math.max(...all.map((d) => d.ord)) }
    : null
  const span = range ? range.max - range.min : 0
  const xOf = (ord: number) =>
    span === 0 ? 0 : ((ord - (range as { min: number }).min) / span) * width

  const positions = new Map<string, Point>()
  const lanes: Lane[] = []
  let y = 0
  for (const key of laneKeys) {
    const items = dated.get(key) as { id: string; ord: number }[]
    const rowEnds: number[] = []
    // Array.sort is stable, so equal ordinals keep input order.
    for (const item of [...items].sort((a, b) => a.ord - b.ord)) {
      const x = xOf(item.ord)
      let r = rowEnds.findIndex((end) => end + minGap <= x)
      if (r === -1) r = rowEnds.length
      rowEnds[r] = x
      positions.set(item.id, { x, y: y + r * rowGap })
    }
    const height = Math.max(1, rowEnds.length) * rowGap
    lanes.push({ key, branchId: key === 'main' ? null : key, y, height })
    y += height
  }
  if (undated.length) {
    undated.forEach((id, i) => positions.set(id, { x: i * minGap, y }))
    lanes.push({ key: 'undated', branchId: null, y, height: rowGap })
  }
  return { positions, laneOf, lanes, range }
}
