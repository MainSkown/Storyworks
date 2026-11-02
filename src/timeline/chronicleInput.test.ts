import { describe, expect, it } from 'vitest'
import { assembleChronicleInput } from './chronicleInput'

const from = { date: { year: 1, month: 0, day: 1 } }
const base = {
  usage: [],
  timelines: [{ id: 'a', nodes: [{ id: 'n1' }, { id: 'n2' }] }, { id: 'b', nodes: [{ id: 'm1' }] }],
  states: [],
  kindName: (id: string) => id,
  relationships: [],
  untitledNode: 'Untitled event',
}

describe('assembleChronicleInput', () => {
  it('ranks nodes by timeline order, then node order', () => {
    const usage = [
      { timelineId: 'b', nodeId: 'm1', nodeTitle: 'M', timelineName: 'B' },
      { timelineId: 'a', nodeId: 'n2', nodeTitle: 'N2', timelineName: 'A' },
      { timelineId: 'a', nodeId: 'n1', nodeTitle: '', timelineName: 'A' },
    ]
    const { nodes } = assembleChronicleInput({ ...base, usage })
    const byRank = [...nodes].sort((x, y) => x.rank - y.rank).map((n) => n.nodeId)
    expect(byRank).toEqual(['n1', 'n2', 'm1'])
    expect(nodes.find((n) => n.nodeId === 'n1')?.title).toBe('Untitled event')
  })

  it('states keep their order and get the kind name', () => {
    const states = [
      { id: 's1', kindId: 'k1', value: 'x', from, until: null, final: false },
      { id: 's2', kindId: 'k2', value: 'y', from, until: null, final: true },
    ]
    const { states: out } = assembleChronicleInput({ ...base, states, kindName: (id) => `name-${id}` })
    expect(out.map((s) => [s.id, s.kindName, s.rank])).toEqual([['s1', 'name-k1', 0], ['s2', 'name-k2', 1]])
  })

  it('keeps only relationships tied to a node', () => {
    const relationships = [
      { id: 'r1', label: 'friend', otherName: 'Bo', nodeRef: { timelineId: 'a', nodeId: 'n1' } },
      { id: 'r2', label: 'rival', otherName: 'Cy', nodeRef: null },
    ]
    const { relationships: out } = assembleChronicleInput({ ...base, relationships })
    expect(out.map((r) => r.id)).toEqual(['r1'])
  })

  it('a node missing from its timeline still gets a rank after the others', () => {
    const usage = [{ timelineId: 'a', nodeId: 'gone', nodeTitle: 'G', timelineName: 'A' }]
    expect(assembleChronicleInput({ ...base, usage }).nodes[0].rank).toBeGreaterThan(1)
  })
})
