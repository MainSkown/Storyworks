import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from '../components/graph/types'

export interface XY {
  x: number
  y: number
}

export interface LayoutInput {
  nodes: { id: string }[]
  edges: { from: string; to: string }[]
  groups: { id: string; memberIds: string[] }[]
  /** Positions the user placed; these never move and anchor the rest. */
  saved: Record<string, XY>
}

export interface LayoutOptions {
  width?: number
  height?: number
  /** Extra space kept between node boxes. */
  gap?: number
  iterations?: number
}

const IDEAL = 260
const GROUP_PULL = 0.5
const GRAVITY = 0.06
/** Beyond this distance nodes stop repelling, so separate clusters settle near each other. */
const REPEL_RANGE = IDEAL * 2

/**
 * Deterministic force layout (Fruchterman-Reingold style): repulsion between all nodes, springs
 * along edges, a pull of group members towards their group centre, then box de-overlap.
 * Saved nodes are fixed anchors; new nodes start on a spiral around them.
 */
export function computeLayout(
  input: LayoutInput,
  {
    width = DEFAULT_NODE_WIDTH,
    height = DEFAULT_NODE_HEIGHT,
    gap = 16,
    iterations = 120,
  }: LayoutOptions = {},
): Record<string, XY> {
  const n = input.nodes.length
  const index = new Map<string, number>()
  input.nodes.forEach((node, i) => {
    if (!index.has(node.id)) index.set(node.id, i)
  })
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const fixed = new Uint8Array(n)

  let cx = 0
  let cy = 0
  let anchors = 0
  for (const [id, i] of index) {
    const s = input.saved[id]
    if (!s) continue
    x[i] = s.x
    y[i] = s.y
    fixed[i] = 1
    cx += s.x
    cy += s.y
    anchors++
  }
  if (anchors) {
    cx /= anchors
    cy /= anchors
  }

  // Golden-angle spiral start, ring radius grows past the anchors' extent.
  let spread = 0
  for (let i = 0; i < n; i++)
    if (fixed[i]) spread = Math.max(spread, Math.hypot(x[i]! - cx, y[i]! - cy))
  let k = 0
  for (const i of index.values()) {
    if (fixed[i]) continue
    const r = spread * 0.5 + IDEAL * 0.8 * Math.sqrt(k + 1)
    const a = k * 2.399963229728653
    x[i] = cx + r * Math.cos(a)
    y[i] = cy + r * Math.sin(a)
    k++
  }

  const edges: [number, number][] = []
  for (const e of input.edges) {
    const a = index.get(e.from)
    const b = index.get(e.to)
    if (a !== undefined && b !== undefined && a !== b) edges.push([a, b])
  }
  const groups = input.groups
    .map((g) => [
      ...new Set(g.memberIds.map((m) => index.get(m)).filter((i): i is number => i !== undefined)),
    ])
    .filter((g) => g.length > 1)

  if (k > 0) {
    const dx = new Float64Array(n)
    const dy = new Float64Array(n)
    const t0 = IDEAL
    for (let it = 0; it < iterations; it++) {
      const t = t0 * (1 - it / iterations) + 1
      dx.fill(0)
      dy.fill(0)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let ex = x[i]! - x[j]!
          let ey = y[i]! - y[j]!
          let d = Math.hypot(ex, ey)
          if (d < 1) {
            ex = (j - i) % 2 ? 1 : -1
            ey = 0.5
            d = 1
          }
          if (d > REPEL_RANGE) continue
          const f = (IDEAL * IDEAL) / d / d
          dx[i] += ex * f
          dy[i] += ey * f
          dx[j] -= ex * f
          dy[j] -= ey * f
        }
      }
      for (const [a, b] of edges) {
        const ex = x[a]! - x[b]!
        const ey = y[a]! - y[b]!
        const d = Math.hypot(ex, ey)
        const f = d / IDEAL
        dx[a] -= ex * f
        dy[a] -= ey * f
        dx[b] += ex * f
        dy[b] += ey * f
      }
      for (const g of groups) {
        let gx = 0
        let gy = 0
        for (const i of g) {
          gx += x[i]!
          gy += y[i]!
        }
        gx /= g.length
        gy /= g.length
        for (const i of g) {
          dx[i] += (gx - x[i]!) * GROUP_PULL * 0.02 * IDEAL
          dy[i] += (gy - y[i]!) * GROUP_PULL * 0.02 * IDEAL
        }
      }
      for (let i = 0; i < n; i++) {
        if (fixed[i]) continue
        dx[i] += (cx - x[i]!) * GRAVITY
        dy[i] += (cy - y[i]!) * GRAVITY
        const len = Math.hypot(dx[i]!, dy[i]!)
        if (len < 1e-9) continue
        const step = Math.min(len, t)
        x[i] += (dx[i]! / len) * step
        y[i] += (dy[i]! / len) * step
      }
    }
    separate(x, y, fixed, width + gap, height + gap)
  }

  const out: Record<string, XY> = {}
  for (const [id, i] of index) {
    out[id] = fixed[i] ? { x: x[i]!, y: y[i]! } : { x: Math.round(x[i]!), y: Math.round(y[i]!) }
  }
  return out
}

/** Push overlapping boxes apart along the shallower axis; fixed nodes never move. */
function separate(x: Float64Array, y: Float64Array, fixed: Uint8Array, w: number, h: number) {
  const n = x.length
  for (let pass = 0; pass < 400; pass++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (fixed[i] && fixed[j]) continue
        const ex = x[j]! - x[i]!
        const ey = y[j]! - y[i]!
        const px = w - Math.abs(ex)
        const py = h - Math.abs(ey)
        if (px <= 0 || py <= 0) continue
        moved = true
        const horizontal = px <= py
        const amount = (horizontal ? px : py) + 0.5
        const dir = (horizontal ? ex : ey) >= 0 ? 1 : -1
        const share = fixed[i] || fixed[j] ? 1 : 0.5
        const arr = horizontal ? x : y
        if (!fixed[j]) arr[j] += dir * amount * share
        if (!fixed[i]) arr[i] -= dir * amount * share
      }
    }
    if (!moved) break
  }
}

type Pt = XY

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/**
 * Convex hull (counter-clockwise, y down so it looks clockwise on screen) of the padded node
 * boxes. `positions` are box top-left corners. One or two points yield a padded rectangle.
 */
export function groupRegion(
  positions: Pt[],
  { width, height, padding }: { width: number; height: number; padding: number },
): Pt[] {
  const pts: Pt[] = []
  for (const p of positions) {
    for (const cx of [p.x - padding, p.x + width + padding])
      for (const cy of [p.y - padding, p.y + height + padding]) pts.push({ x: cx, y: cy })
  }
  pts.sort((a, b) => a.x - b.x || a.y - b.y)
  const uniq = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y)
  if (uniq.length < 3) return uniq
  const lower: Pt[] = []
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (const p of [...uniq].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Closed SVG path through the polygon with corners rounded by up to `radius`. */
export function regionPath(points: Pt[], radius: number): string {
  const n = points.length
  if (n === 0) return ''
  const f = (v: number) => Math.round(v * 100) / 100
  const toward = (from: Pt, to: Pt, dist: number): Pt => {
    const d = Math.hypot(to.x - from.x, to.y - from.y)
    if (d === 0) return from
    return { x: from.x + ((to.x - from.x) / d) * dist, y: from.y + ((to.y - from.y) / d) * dist }
  }
  let d = ''
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n]!
    const v = points[i]!
    const next = points[(i + 1) % n]!
    const r = Math.min(
      radius,
      Math.hypot(prev.x - v.x, prev.y - v.y) / 2,
      Math.hypot(next.x - v.x, next.y - v.y) / 2,
    )
    const s = toward(v, prev, r)
    const e = toward(v, next, r)
    d += `${i === 0 ? 'M' : 'L'}${f(s.x)} ${f(s.y)}Q${f(v.x)} ${f(v.y)} ${f(e.x)} ${f(e.y)}`
  }
  return `${d}Z`
}
