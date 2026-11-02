import { describe, expect, it } from 'vitest'
import { computeLayout, groupRegion, regionPath } from './layout'

const W = 168
const H = 56
const ring = (n: number, prefix = 'n') =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }))
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length

function overlaps(pos: Record<string, { x: number; y: number }>) {
  const ids = Object.keys(pos)
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = pos[ids[i]!]!
      const b = pos[ids[j]!]!
      if (Math.abs(a.x - b.x) < W && Math.abs(a.y - b.y) < H) return true
    }
  return false
}

describe('computeLayout', () => {
  const nodes = ring(8)
  const edges = [
    { from: 'n0', to: 'n1' },
    { from: 'n1', to: 'n2' },
    { from: 'n3', to: 'n4' },
  ]

  it('handles empty and single-node input', () => {
    expect(computeLayout({ nodes: [], edges: [], groups: [], saved: {} })).toEqual({})
    const one = computeLayout({ nodes: [{ id: 'a' }], edges: [], groups: [], saved: {} })
    expect(Object.keys(one)).toEqual(['a'])
    expect(Number.isFinite(one.a!.x) && Number.isFinite(one.a!.y)).toBe(true)
  })

  it('is deterministic', () => {
    const input = { nodes, edges, groups: [{ id: 'g', memberIds: ['n0', 'n5'] }], saved: {} }
    expect(computeLayout(input)).toEqual(computeLayout(structuredClone(input)))
  })

  it('places every node, including disconnected ones, finite', () => {
    const pos = computeLayout({ nodes, edges, groups: [], saved: {} })
    expect(Object.keys(pos).sort()).toEqual(nodes.map((n) => n.id).sort())
    for (const p of Object.values(pos)) expect(Number.isFinite(p.x + p.y)).toBe(true)
  })

  it('keeps saved positions exactly', () => {
    const saved = { n0: { x: 1000, y: -400 }, n3: { x: 37.5, y: 12 } }
    const pos = computeLayout({ nodes, edges, groups: [], saved })
    expect(pos.n0).toEqual(saved.n0)
    expect(pos.n3).toEqual(saved.n3)
  })

  it('places new nodes without overlapping saved ones', () => {
    const saved = { n0: { x: 0, y: 0 }, n1: { x: 300, y: 0 } }
    const pos = computeLayout({ nodes, edges, groups: [], saved })
    expect(overlaps(pos)).toBe(false)
  })

  it('keeps separate clusters close together', () => {
    const pos = computeLayout({
      nodes: ring(5),
      edges: [
        { from: 'n0', to: 'n1' },
        { from: 'n0', to: 'n2' },
        { from: 'n3', to: 'n4' },
      ],
      groups: [],
      saved: {},
    })
    const xs = Object.values(pos).map((p) => p.x)
    const ys = Object.values(pos).map((p) => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1200)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1200)
  })

  it('leaves no overlapping boxes', () => {
    const many = ring(40)
    const es = many.slice(1).map((n, i) => ({ from: many[i]!.id, to: n.id }))
    expect(overlaps(computeLayout({ nodes: many, edges: es, groups: [], saved: {} }))).toBe(false)
  })

  it('pulls group members closer to each other than to non-members', () => {
    const ns = ring(12)
    const members = ['n0', 'n1', 'n2', 'n3']
    // Edges link members to outsiders so only the group can pull them together.
    const es = ns.slice(4).map((n, i) => ({ from: n.id, to: members[i % 4]! }))
    const pos = computeLayout({
      nodes: ns,
      edges: es,
      groups: [{ id: 'g', memberIds: members }],
      saved: {},
    })
    const inside: number[] = []
    const across: number[] = []
    for (const a of members) {
      for (const b of members) if (a < b) inside.push(dist(pos[a]!, pos[b]!))
      for (const n of ns) if (!members.includes(n.id)) across.push(dist(pos[a]!, pos[n.id]!))
    }
    expect(mean(inside)).toBeLessThan(mean(across))
  })

  it('ignores ids that are not nodes', () => {
    const input = {
      nodes: ring(4),
      edges: [{ from: 'n0', to: 'n1' }],
      groups: [{ id: 'g', memberIds: ['n0', 'n1'] }],
      saved: {},
    }
    const noisy = {
      nodes: input.nodes,
      edges: [...input.edges, { from: 'n0', to: 'ghost' }, { from: 'ghost', to: 'n2' }],
      groups: [{ id: 'g', memberIds: ['n0', 'n1', 'ghost'] }],
      saved: { ghost: { x: 5, y: 5 } },
    }
    const pos = computeLayout(noisy)
    expect(Object.keys(pos).sort()).toEqual(['n0', 'n1', 'n2', 'n3'])
    expect(pos).toEqual(computeLayout(input))
  })

  it('lays out 300 nodes and 600 edges in reasonable time', () => {
    const ns = ring(300)
    const es = Array.from({ length: 600 }, (_, i) => ({
      from: `n${i % 300}`,
      to: `n${(i * 7 + 13) % 300}`,
    }))
    const t = performance.now()
    const pos = computeLayout({ nodes: ns, edges: es, groups: [], saved: {} })
    expect(performance.now() - t).toBeLessThan(2000)
    expect(Object.keys(pos)).toHaveLength(300)
    expect(overlaps(pos)).toBe(false)
  })
})

function inHull(poly: { x: number; y: number }[], p: { x: number; y: number }) {
  // Convex polygon, any winding: point must be on one side of every edge (with tolerance).
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (Math.abs(c) < 1e-6) continue
    if (sign === 0) sign = Math.sign(c)
    else if (Math.sign(c) !== sign) return false
  }
  return true
}

describe('groupRegion', () => {
  const opts = { width: W, height: H, padding: 20 }
  const corners = (pts: { x: number; y: number }[]) =>
    pts.flatMap((p) => [
      { x: p.x - 20, y: p.y - 20 },
      { x: p.x + W + 20, y: p.y - 20 },
      { x: p.x - 20, y: p.y + H + 20 },
      { x: p.x + W + 20, y: p.y + H + 20 },
    ])

  it.each([
    ['one point', [{ x: 10, y: 10 }]],
    [
      'two points',
      [
        { x: 0, y: 0 },
        { x: 400, y: 100 },
      ],
    ],
    [
      'collinear points',
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 400, y: 0 },
      ],
    ],
    [
      'scattered points',
      [
        { x: 0, y: 0 },
        { x: 500, y: 40 },
        { x: 250, y: 300 },
        { x: 240, y: 100 },
      ],
    ],
  ])('contains every padded box corner: %s', (_n, pts) => {
    const poly = groupRegion(pts, opts)
    expect(poly.length).toBeGreaterThanOrEqual(4)
    for (const c of corners(pts)) expect(inHull(poly, c)).toBe(true)
  })

  it('returns an empty polygon for no points', () => {
    expect(groupRegion([], opts)).toEqual([])
  })
})

describe('regionPath', () => {
  it('builds a closed path with rounded corners', () => {
    const d = regionPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      10,
    )
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d).toContain('Q')
    expect(d).not.toContain('NaN')
  })

  it('returns an empty string for no points', () => {
    expect(regionPath([], 10)).toBe('')
  })
})
