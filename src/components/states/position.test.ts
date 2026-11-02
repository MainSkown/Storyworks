import { describe, expect, it } from 'vitest'
import { describePosition } from './position'

const timelines = [
  {
    id: 't1',
    name: 'Main',
    branches: [],
    nodes: [
      { id: 'n1', title: 'Coronation', tag: null, branchId: null, date: { year: 1400, month: 3, day: 12 } },
    ],
  },
]
const fmt = (d: { year: number; month: number; day: number }) => `${d.day}.${d.month}.${d.year}`

describe('describePosition', () => {
  it('describes an existing event with its timeline and date', () => {
    expect(describePosition({ node: { timelineId: 't1', nodeId: 'n1' } }, timelines, fmt)).toEqual({
      kind: 'event',
      title: 'Coronation',
      timelineName: 'Main',
      date: '12.3.1400',
    })
  })

  it('flags a missing node or timeline', () => {
    expect(describePosition({ node: { timelineId: 't1', nodeId: 'x' } }, timelines, fmt).kind).toBe('missing-event')
    expect(describePosition({ node: { timelineId: 'x', nodeId: 'n1' } }, timelines, fmt).kind).toBe('missing-event')
  })

  it('formats a date position', () => {
    expect(describePosition({ date: { year: 5, month: 1, day: 2 } }, timelines, fmt)).toEqual({
      kind: 'date',
      date: '2.1.5',
    })
  })
})
