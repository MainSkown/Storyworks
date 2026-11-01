import { describe, expect, it } from 'vitest'
import { parseFile, serialize } from '../project/serialize'
import { TIMELINE_VERSION, timelineSchema, type Timeline } from './schema'

const node = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  ...extra,
})

const base = (over: Record<string, unknown> = {}) => ({
  version: TIMELINE_VERSION,
  id: 't1',
  name: 'Main timeline',
  nodes: [node('a'), node('b'), node('c')],
  edges: [
    { id: 'e1', from: 'a', to: 'b' },
    { id: 'e2', from: 'b', to: 'c' },
  ],
  ...over,
})

const reject = (v: unknown) => timelineSchema.safeParse(v)

describe('timeline schema', () => {
  it('is version 1', () => {
    expect(TIMELINE_VERSION).toBe(1)
  })

  it('loads a valid file', () => {
    expect(reject(base()).success).toBe(true)
  })

  it('fills defaults for node, branch and view', () => {
    const r = timelineSchema.parse(base({ branches: [{ id: 'br', name: 'Side', color: '#f00' }] }))
    expect(r.view).toBe('flow')
    expect(r.branches[0].dashed).toBe(false)
    expect(r.nodes[0]).toMatchObject({
      date: null,
      color: null,
      tag: null,
      branchId: null,
      pos: { x: 0, y: 0 },
      codexIds: [],
      ruleIds: [],
    })
  })

  it('accepts a date and a branch reference', () => {
    const r = reject(
      base({
        branches: [{ id: 'br', name: 'Side', color: '#f00', dashed: true }],
        nodes: [node('a', { date: { year: -5, month: 0, day: 1 }, branchId: 'br' })],
        edges: [],
      }),
    )
    expect(r.success).toBe(true)
  })

  it('rejects a malformed date', () => {
    for (const date of [
      { year: 1.5, month: 0, day: 1 },
      { year: 1, month: -1, day: 1 },
      { year: 1, month: 0, day: 0 },
      { year: 1, month: 0 },
    ])
      expect(reject(base({ nodes: [node('a', { date })], edges: [] })).success).toBe(false)
  })

  it('rejects the wrong version', () => {
    expect(reject(base({ version: 2 })).success).toBe(false)
  })

  it('rejects unknown keys and a bad view', () => {
    expect(reject(base({ extra: 1 })).success).toBe(false)
    expect(reject(base({ view: 'grid' })).success).toBe(false)
  })

  it('rejects duplicate node ids', () => {
    expect(reject(base({ nodes: [node('a'), node('a')], edges: [] })).success).toBe(false)
  })

  it('rejects duplicate edge ids and duplicate branch ids', () => {
    expect(
      reject(
        base({
          edges: [
            { id: 'e1', from: 'a', to: 'b' },
            { id: 'e1', from: 'b', to: 'c' },
          ],
        }),
      ).success,
    ).toBe(false)
    const br = { id: 'x', name: 'X', color: '#000' }
    expect(reject(base({ branches: [br, br] })).success).toBe(false)
  })

  it('rejects an edge to a missing node', () => {
    expect(reject(base({ edges: [{ id: 'e1', from: 'a', to: 'zz' }] })).success).toBe(false)
    expect(reject(base({ edges: [{ id: 'e1', from: 'zz', to: 'a' }] })).success).toBe(false)
  })

  it('rejects a node on a missing branch', () => {
    expect(reject(base({ nodes: [node('a', { branchId: 'nope' })], edges: [] })).success).toBe(
      false,
    )
  })

  it('rejects a self-edge', () => {
    expect(reject(base({ edges: [{ id: 'e1', from: 'a', to: 'a' }] })).success).toBe(false)
  })

  it('rejects a duplicate edge', () => {
    const edges = [
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'a', to: 'b' },
    ]
    expect(reject(base({ edges })).success).toBe(false)
  })

  it('rejects a cycle', () => {
    const edges = [
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'b', to: 'c' },
      { id: 'e3', from: 'c', to: 'a' },
    ]
    const r = reject(base({ edges }))
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/cycle/i)
  })

  it('accepts branch and merge (diamond)', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => node(id))
    const edges = [
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'a', to: 'c' },
      { id: 'e3', from: 'b', to: 'd' },
      { id: 'e4', from: 'c', to: 'd' },
    ]
    expect(reject(base({ nodes, edges })).success).toBe(true)
  })

  it('a cyclic file is rejected by parseFile and nothing is repaired', () => {
    const text = JSON.stringify(
      base({
        edges: [
          { id: 'e1', from: 'a', to: 'b' },
          { id: 'e2', from: 'b', to: 'a' },
        ],
      }),
    )
    const r = parseFile(timelineSchema, text, 'timelines/t1.json')
    expect(r.ok).toBe(false)
  })

  it('serializes with stable key order', () => {
    const t: Timeline = timelineSchema.parse(base())
    const shuffled = JSON.parse(JSON.stringify(t))
    const reordered = {
      edges: shuffled.edges,
      nodes: shuffled.nodes.map((n: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(n).reverse()),
      ),
      name: shuffled.name,
      id: shuffled.id,
      view: shuffled.view,
      branches: shuffled.branches,
      version: shuffled.version,
    }
    const a = serialize(timelineSchema, t)
    const b = serialize(timelineSchema, timelineSchema.parse(reordered))
    expect(b).toBe(a)
    expect(Object.keys(JSON.parse(a))).toEqual([
      'version',
      'id',
      'name',
      'view',
      'branches',
      'nodes',
      'edges',
    ])
  })
})
