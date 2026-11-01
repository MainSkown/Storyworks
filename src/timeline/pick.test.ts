import { describe, expect, it } from 'vitest'
import { describeTarget, groupPickerNodes, type PickerTimeline } from './pick'

const fmt = (d: { year: number; month: number; day: number }) => `${d.day}/${d.month + 1}/${d.year}`

const timelines: PickerTimeline[] = [
  {
    id: 't1',
    name: 'Main plot',
    branches: [{ id: 'b1', name: 'Dark path' }],
    nodes: [
      { id: 'n1', title: 'The siege', tag: 'war', branchId: null, date: { year: 5, month: 0, day: 3 } },
      { id: 'n2', title: 'The betrayal', tag: null, branchId: 'b1', date: null },
    ],
  },
  { id: 't2', name: 'Backstory', branches: [], nodes: [] },
  {
    id: 't3',
    name: 'Journey',
    branches: [],
    nodes: [{ id: 'n3', title: 'Crossing', tag: null, branchId: null, date: null }],
  },
]

describe('groupPickerNodes', () => {
  it('groups by timeline in order and drops empty timelines', () => {
    const g = groupPickerNodes(timelines, '', fmt)
    expect(g.map((x) => x.name)).toEqual(['Main plot', 'Journey'])
    expect(g[0]!.rows.map((r) => r.nodeId)).toEqual(['n1', 'n2'])
  })

  it('fills date text and a chip from tag or branch', () => {
    const rows = groupPickerNodes(timelines, '', fmt)[0]!.rows
    expect(rows[0]).toMatchObject({ date: '3/1/5', chip: 'war' })
    expect(rows[1]).toMatchObject({ date: '', chip: 'Dark path' })
  })

  it('filters by every word, case-insensitive', () => {
    expect(groupPickerNodes(timelines, 'BETRAY dark', fmt)[0]!.rows.map((r) => r.nodeId)).toEqual(['n2'])
    expect(groupPickerNodes(timelines, 'siege dark', fmt)).toEqual([])
  })

  it('matches on date text and tag', () => {
    expect(groupPickerNodes(timelines, '3/1/5', fmt)[0]!.rows).toHaveLength(1)
    expect(groupPickerNodes(timelines, 'war', fmt)[0]!.rows[0]!.nodeId).toBe('n1')
  })

  it('a timeline name match keeps all its nodes', () => {
    const g = groupPickerNodes(timelines, 'main', fmt)
    expect(g).toHaveLength(1)
    expect(g[0]!.rows).toHaveLength(2)
  })
})

describe('describeTarget', () => {
  it('describes a live node', () => {
    expect(describeTarget(timelines, { item: 't1', block: 'n1' }, fmt)).toEqual({
      timelineName: 'Main plot',
      title: 'The siege',
      date: '3/1/5',
    })
  })
  it('is null when the timeline or node is missing', () => {
    expect(describeTarget(timelines, { item: 'x', block: 'n1' }, fmt)).toBeNull()
    expect(describeTarget(timelines, { item: 't1', block: 'zz' }, fmt)).toBeNull()
  })
})
