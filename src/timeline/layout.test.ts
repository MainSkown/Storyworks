import { describe, expect, it } from 'vitest'
import { datePlacement, tidyLayout, type LayoutNode } from './layout'

const nodes = (...ids: string[]): LayoutNode[] => ids.map((id) => ({ id }))
const e = (from: string, to: string) => ({ id: `${from}-${to}`, from, to })

describe('tidyLayout', () => {
  it('puts sources left and children to the right', () => {
    const p = tidyLayout(nodes('a', 'b', 'c'), [e('a', 'b'), e('b', 'c')])
    expect(p.get('a')!.x).toBeLessThan(p.get('b')!.x)
    expect(p.get('b')!.x).toBeLessThan(p.get('c')!.x)
  })

  it('a merge sits right of all its parents (longest path)', () => {
    const p = tidyLayout(nodes('a', 'b', 'c', 'm'), [
      e('a', 'b'),
      e('b', 'c'),
      e('a', 'm'),
      e('c', 'm'),
    ])
    expect(p.get('m')!.x).toBeGreaterThan(p.get('c')!.x)
  })

  it('siblings share a layer but not a row', () => {
    const p = tidyLayout(nodes('a', 'b', 'c'), [e('a', 'b'), e('a', 'c')])
    expect(p.get('b')!.x).toBe(p.get('c')!.x)
    expect(p.get('b')!.y).not.toBe(p.get('c')!.y)
  })

  it('same input gives the same output', () => {
    const n = nodes('a', 'b', 'c', 'd')
    const ed = [e('a', 'b'), e('a', 'c'), e('c', 'd')]
    expect([...tidyLayout(n, ed)]).toEqual([...tidyLayout(n, ed)])
  })

  it('places every node, including isolated ones and edges to unknown ids', () => {
    const p = tidyLayout(nodes('a', 'b', 'lone'), [e('a', 'b'), e('a', 'ghost')])
    expect([...p.keys()].sort()).toEqual(['a', 'b', 'lone'])
  })

  it('does not drop nodes on a cyclic input', () => {
    const p = tidyLayout(nodes('a', 'b', 'c'), [e('a', 'b'), e('b', 'a')])
    expect(p.size).toBe(3)
  })

  it('no two nodes share a position', () => {
    const p = tidyLayout(nodes('a', 'b', 'c', 'd', 'e'), [
      e('a', 'b'),
      e('a', 'c'),
      e('a', 'd'),
      e('b', 'e'),
      e('c', 'e'),
    ])
    const seen = new Set([...p.values()].map((v) => `${v.x},${v.y}`))
    expect(seen.size).toBe(5)
  })
})

describe('datePlacement', () => {
  const dated = (id: string, year: number, branchId: string | null = null): LayoutNode => ({
    id,
    branchId,
    date: { year, month: 0, day: 1 },
  })
  const calOrd = (d: { year: number }) => d.year

  it('orders nodes along x by ordinal', () => {
    const r = datePlacement([dated('b', 50), dated('a', 10), dated('c', 110)], [], calOrd)
    const x = (id: string) => r.positions.get(id)!.x
    expect(x('a')).toBeLessThan(x('b'))
    expect(x('b')).toBeLessThan(x('c'))
  })

  it('x is proportional to the ordinal', () => {
    const r = datePlacement([dated('a', 0), dated('b', 50), dated('c', 100)], [], calOrd)
    const x = (id: string) => r.positions.get(id)!.x
    expect(x('b') - x('a')).toBeCloseTo(x('c') - x('b'))
  })

  it('a single dated node does not divide by zero', () => {
    const r = datePlacement([dated('a', 5)], [], calOrd)
    expect(Number.isFinite(r.positions.get('a')!.x)).toBe(true)
  })

  it('puts undated and unorderable nodes in their own lane, none dropped', () => {
    const nodesIn: LayoutNode[] = [
      dated('a', 5),
      { id: 'u1', date: null },
      { id: 'bad', date: { year: 9, month: 0, day: 1 } },
      { id: 'u2' },
    ]
    const r = datePlacement(nodesIn, [], (d) => (d.year === 9 ? null : d.year))
    expect(r.positions.size).toBe(4)
    const lane = (id: string) => r.laneOf.get(id)
    expect(lane('a')).toBe('main')
    expect(lane('u1')).toBe('undated')
    expect(lane('bad')).toBe('undated')
    expect(lane('u2')).toBe('undated')
    expect(r.positions.get('u1')!.y).toBe(r.positions.get('u2')!.y)
    expect(r.positions.get('u1')!.y).toBeGreaterThan(r.positions.get('a')!.y)
  })

  it('has no Undated lane when every node is dated', () => {
    const r = datePlacement([dated('a', 1)], [], calOrd)
    expect(r.lanes.map((l) => l.key)).toEqual(['main'])
  })

  it('gives each branch its own lane below main, in branch order', () => {
    const branches = [
      { id: 'x', name: 'X' },
      { id: 'y', name: 'Y' },
    ]
    const r = datePlacement(
      [dated('m', 1), dated('ny', 2, 'y'), dated('nx', 3, 'x')],
      branches,
      calOrd,
    )
    expect(r.lanes.map((l) => l.key)).toEqual(['main', 'x', 'y'])
    const y = (id: string) => r.positions.get(id)!.y
    expect(y('m')).toBeLessThan(y('nx'))
    expect(y('nx')).toBeLessThan(y('ny'))
  })

  it('a node on an unknown branch falls into main', () => {
    const r = datePlacement([dated('a', 1, 'ghost')], [], calOrd)
    expect(r.laneOf.get('a')).toBe('main')
  })

  it('same-lane nodes at the same date do not overlap', () => {
    const r = datePlacement([dated('a', 5), dated('b', 5)], [], calOrd)
    const a = r.positions.get('a')!
    const b = r.positions.get('b')!
    expect(a.x === b.x && a.y === b.y).toBe(false)
  })

  it('same input gives the same output', () => {
    const n = [dated('a', 3), { id: 'u' } as LayoutNode, dated('b', 1)]
    const one = datePlacement(n, [], calOrd)
    const two = datePlacement(n, [], calOrd)
    expect([...one.positions]).toEqual([...two.positions])
  })

  it('reports the ordinal range for the axis', () => {
    const r = datePlacement([dated('a', 10), dated('b', 90)], [], calOrd)
    expect(r.range).toEqual({ min: 10, max: 90 })
    expect(datePlacement([{ id: 'u' }], [], calOrd).range).toBeNull()
  })
})
