import { describe, expect, it } from 'vitest'
import { gregorianCalendar, type CalendarDate } from '../calendar'
import type { OrderContext, OrderTimeline, Position } from './order'
import { buildChronicle, type ChronicleInput } from './chronicle'

const cal = gregorianCalendar('cal')
const d = (year: number, month = 0, day = 1): CalendarDate => ({ year, month, day })
const on = (date: CalendarDate): Position => ({ date })
const at = (timelineId: string, nodeId: string): Position => ({ node: { timelineId, nodeId } })
const tl = (nodes: [string, CalendarDate?][], pairs: [string, string][] = []): OrderTimeline => ({
  nodes: nodes.map(([id, date]) => ({ id, date: date ?? null })),
  edges: pairs.map(([from, to], i) => ({ id: `e${i}`, from, to })),
})
// t: n1(100) -> mid(undated) -> n3(300); other: lonely, undated
const timelines = { t: tl([['n1', d(100)], ['mid'], ['n3', d(300)]], [['n1', 'mid'], ['mid', 'n3']]), other: tl([['lonely']]) }
const ctx: OrderContext = { calendar: cal, timeline: (id) => timelines[id as keyof typeof timelines] }

const empty: ChronicleInput = { nodes: [], states: [], relationships: [] }
const state = (id: string, from: Position, rank = 0, over: object = {}) => ({
  id, kindId: 'k', kindName: 'Location', value: 'Town', from, until: null, final: false, rank, ...over,
})
const ids = (input: ChronicleInput) => buildChronicle(input, ctx).map((r) => r.id)

describe('buildChronicle', () => {
  it('empty input gives no rows', () => {
    expect(buildChronicle(empty, ctx)).toEqual([])
  })

  it('mixes nodes, states and relationships in chronological order', () => {
    const rows = buildChronicle(
      {
        nodes: [
          { timelineId: 't', nodeId: 'n3', title: 'Third', rank: 1 },
          { timelineId: 't', nodeId: 'n1', title: 'First', rank: 0 },
        ],
        states: [state('s1', on(d(200)))],
        relationships: [{ id: 'r1', label: 'friend', otherName: 'Bo', nodeRef: { timelineId: 't', nodeId: 'mid' }, rank: 0 }],
      },
      ctx,
    )
    // mid is between n1 and n3 by path; the state (date 200) is dated, mid is undated
    expect(rows.map((r) => r.id)).toEqual(['node:t:n1', 'state:s1', 'relationship:r1', 'node:t:n3'])
  })

  it('rows carry label, position, resolved date and target', () => {
    const rows = buildChronicle(
      {
        nodes: [{ timelineId: 't', nodeId: 'n1', title: 'First', rank: 0 }],
        states: [state('s1', on(d(150)), 0, { until: on(d(250)), final: true })],
        relationships: [{ id: 'r1', label: 'friend', otherName: 'Bo', nodeRef: { timelineId: 't', nodeId: 'n3' }, rank: 0 }],
      },
      ctx,
    )
    expect(rows[0]).toMatchObject({
      kind: 'node', label: 'First', date: d(100), position: at('t', 'n1'),
      target: { type: 'node', timelineId: 't', nodeId: 'n1' },
    })
    expect(rows[1]).toMatchObject({
      kind: 'state', label: 'Location', value: 'Town', date: d(150), position: on(d(150)),
      until: on(d(250)), final: true, target: { type: 'state', stateId: 's1' },
    })
    expect(rows[2]).toMatchObject({
      kind: 'relationship', label: 'friend', otherName: 'Bo', date: d(300),
      target: { type: 'relationship', relationshipId: 'r1' },
    })
  })

  it('same-date items keep a stable order: nodes, states, relationships, extras, then rank', () => {
    const input: ChronicleInput = {
      nodes: [{ timelineId: 't', nodeId: 'n1', title: 'N', rank: 0 }],
      states: [state('s2', on(d(100)), 1), state('s1', on(d(100)), 0)],
      relationships: [{ id: 'r1', label: 'x', otherName: 'y', nodeRef: { timelineId: 't', nodeId: 'n1' }, rank: 0 }],
      extra: [{ id: 'k1', label: 'learns', position: on(d(100)), rank: 0, kind: 'knowledge' }],
    }
    expect(ids(input)).toEqual(['node:t:n1', 'state:s1', 'state:s2', 'relationship:r1', 'knowledge:k1'])
  })

  it('undetermined rows come last, in rank order', () => {
    const input: ChronicleInput = {
      nodes: [
        { timelineId: 'other', nodeId: 'lonely', title: 'L', rank: 5 },
        { timelineId: 't', nodeId: 'n3', title: 'Third', rank: 9 },
      ],
      states: [state('s1', at('t', 'gone'), 0)],
      relationships: [],
    }
    expect(ids(input)).toEqual(['node:t:n3', 'node:other:lonely', 'state:s1'])
  })

  it('a state whose node is missing is still listed, with no date', () => {
    const rows = buildChronicle({ ...empty, states: [state('s1', at('t', 'gone'))] }, ctx)
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBeNull()
  })

  it('extra rows use their own kind and a null position goes last', () => {
    const rows = buildChronicle(
      { ...empty, extra: [{ id: 'k1', label: 'learns', position: null, rank: 0, kind: 'knowledge' }, { id: 'k2', label: 'forgets', position: on(d(1)), rank: 1, kind: 'knowledge' }] },
      ctx,
    )
    expect(rows.map((r) => r.id)).toEqual(['knowledge:k2', 'knowledge:k1'])
    expect(rows[0]).toMatchObject({ kind: 'knowledge', target: { type: 'extra', kind: 'knowledge', id: 'k2' } })
  })

  it('rows say whether their order is known', () => {
    const rows = buildChronicle(
      {
        nodes: [
          { timelineId: 't', nodeId: 'n1', title: 'First', rank: 0 },
          { timelineId: 'other', nodeId: 'lonely', title: 'L', rank: 1 },
        ],
        states: [state('s1', on(d(5)), 0), state('s2', at('t', 'gone'), 1)],
        relationships: [],
      },
      ctx,
    )
    expect(rows.map((r) => [r.id, r.determined])).toEqual([
      ['state:s1', true],
      ['node:t:n1', true],
      ['node:other:lonely', false],
      ['state:s2', false],
    ])
  })
})
