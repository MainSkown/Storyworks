export interface Pt {
  x: number
  y: number
}
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface BackEdgeOpts {
  /** Parallel back edges: 0, 1, 2 ... pushes the run further out. */
  lane?: number
  /** How far the edge leaves/enters sideways before turning. */
  reach?: number
  /** Gap between the run and the nearest node. */
  margin?: number
  laneGap?: number
  radius?: number
}
export interface BackEdge {
  path: string
  labelX: number
  labelY: number
  side: 'below' | 'above'
}

/** Handles are Right (source) -> Left (target); a target at or left of the source needs routing. */
export const isBackEdge = (s: Pt, t: Pt): boolean => t.x <= s.x

const n = (v: number) => Math.round(v * 100) / 100

/** Polyline with quadratic corners; the radius shrinks on short segments. */
export function roundedPath(pts: Pt[], radius: number): string {
  let d = `M ${n(pts[0].x)} ${n(pts[0].y)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const p = pts[i]
    const b = pts[i + 1]
    const la = Math.hypot(p.x - a.x, p.y - a.y)
    const lb = Math.hypot(b.x - p.x, b.y - p.y)
    const r = Math.min(radius, la / 2, lb / 2)
    if (r <= 0) {
      d += ` L ${n(p.x)} ${n(p.y)}`
      continue
    }
    const x1 = p.x - ((p.x - a.x) / la) * r
    const y1 = p.y - ((p.y - a.y) / la) * r
    const x2 = p.x + ((b.x - p.x) / lb) * r
    const y2 = p.y + ((b.y - p.y) / lb) * r
    d += ` L ${n(x1)} ${n(y1)} Q ${n(p.x)} ${n(p.y)} ${n(x2)} ${n(y2)}`
  }
  const last = pts[pts.length - 1]
  return `${d} L ${n(last.x)} ${n(last.y)}`
}

/**
 * Leaves the source to the right, runs below (or above) every node in between
 * and enters the target from the left. A self edge becomes a small loop.
 */
export function backEdgePath(s: Pt, t: Pt, boxes: Rect[], o: BackEdgeOpts = {}): BackEdge {
  const { lane = 0, reach = 16, margin = 30, laneGap = 22, radius = 14 } = o
  const x1 = s.x + reach
  const x2 = t.x - reach
  const lo = Math.min(x1, x2)
  const hi = Math.max(x1, x2)
  let bottom = Math.max(s.y, t.y)
  let top = Math.min(s.y, t.y)
  for (const b of boxes) {
    if (b.x >= hi || b.x + b.w <= lo) continue
    bottom = Math.max(bottom, b.y + b.h)
    top = Math.min(top, b.y)
  }
  const below = bottom + margin + lane * laneGap
  const above = top - margin - lane * laneGap
  const mid = (s.y + t.y) / 2
  // Below is preferred (graphs grow downward); above only when clearly shorter.
  const side = below - mid <= mid - above + 120 ? 'below' : 'above'
  const y = side === 'below' ? below : above
  const pts: Pt[] = [
    s,
    { x: x1, y: s.y },
    { x: x1, y },
    { x: x2, y },
    { x: x2, y: t.y },
    t,
  ]
  return { path: roundedPath(pts, radius), labelX: (x1 + x2) / 2, labelY: y, side }
}
