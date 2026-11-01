import { describe, expect, it } from 'vitest'
import { connect, disconnect, removeNode, wouldCreateCycle, type GraphData } from './graph'

const g = (ids: string[], pairs: [string, string][]): GraphData => ({
  nodes: ids.map((id) => ({ id })),
  edges: pairs.map(([from, to], i) => ({ id: `e${i}`, from, to })),
})

const chain = g(
  ['a', 'b', 'c', 'd'],
  [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
  ],
)

describe('wouldCreateCycle', () => {
  it('self edge', () => {
    expect(wouldCreateCycle(chain, 'a', 'a')).toBe(true)
  })
  it('direct back edge', () => {
    expect(wouldCreateCycle(chain, 'b', 'a')).toBe(true)
  })
  it('long back edge', () => {
    expect(wouldCreateCycle(chain, 'd', 'a')).toBe(true)
  })
  it('forward shortcut is fine', () => {
    expect(wouldCreateCycle(chain, 'a', 'd')).toBe(false)
  })
  it('unrelated nodes are fine', () => {
    expect(wouldCreateCycle(g(['a', 'b'], []), 'a', 'b')).toBe(false)
  })
  it('through a merge', () => {
    const d = g(
      ['a', 'b', 'c', 'm', 'z'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'm'],
        ['c', 'm'],
        ['m', 'z'],
      ],
    )
    expect(wouldCreateCycle(d, 'z', 'c')).toBe(true)
    expect(wouldCreateCycle(d, 'b', 'c')).toBe(false)
  })
})

describe('connect', () => {
  it('adds the edge and leaves the input untouched', () => {
    const r = connect(chain, { id: 'new', from: 'a', to: 'c' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.edges.at(-1)).toEqual({ id: 'new', from: 'a', to: 'c' })
    expect(chain.edges).toHaveLength(3)
  })
  it('rejects a cycle with a reason', () => {
    expect(connect(chain, { id: 'x', from: 'd', to: 'a' })).toEqual({ ok: false, reason: 'cycle' })
  })
  it('rejects a self edge', () => {
    expect(connect(chain, { id: 'x', from: 'a', to: 'a' })).toEqual({ ok: false, reason: 'self' })
  })
  it('rejects a duplicate edge', () => {
    expect(connect(chain, { id: 'x', from: 'a', to: 'b' })).toEqual({
      ok: false,
      reason: 'duplicate',
    })
  })
  it('rejects a missing node', () => {
    expect(connect(chain, { id: 'x', from: 'a', to: 'zz' })).toEqual({
      ok: false,
      reason: 'missing-node',
    })
  })
  it('rejects a reused edge id', () => {
    expect(connect(chain, { id: 'e0', from: 'a', to: 'c' })).toEqual({
      ok: false,
      reason: 'duplicate-id',
    })
  })
  it('accepts a branch and a merge', () => {
    let cur = chain
    for (const [id, from, to] of [
      ['x1', 'a', 'c'],
      ['x2', 'b', 'd'],
    ] as const) {
      const r = connect(cur, { id, from, to })
      expect(r.ok).toBe(true)
      if (r.ok) cur = r.value
    }
    expect(cur.edges).toHaveLength(5)
  })
})

describe('disconnect', () => {
  it('removes only the edge, keeps nodes', () => {
    const r = disconnect(chain, 'e1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.edges.map((e) => e.id)).toEqual(['e0', 'e2'])
      expect(r.value.nodes).toEqual(chain.nodes)
    }
  })
  it('rejects an unknown edge', () => {
    expect(disconnect(chain, 'nope')).toEqual({ ok: false, reason: 'missing-edge' })
  })
})

describe('removeNode', () => {
  it('removes the node and all its edges', () => {
    const r = removeNode(chain, 'b')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.nodes.map((n) => n.id)).toEqual(['a', 'c', 'd'])
      expect(r.value.edges.map((e) => e.id)).toEqual(['e2'])
    }
  })
  it('rejects an unknown node', () => {
    expect(removeNode(chain, 'zz')).toEqual({ ok: false, reason: 'missing-node' })
  })
  it('keeps extra fields on the value', () => {
    const t = { ...chain, name: 'T' }
    const r = removeNode(t, 'a')
    expect(r.ok && r.value.name).toBe('T')
  })
})
