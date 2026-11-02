import { describe, expect, it } from 'vitest'
import { gregorianCalendar, type CalendarDate } from '../calendar'
import type { OrderContext, OrderTimeline, Position } from '../timeline/order'
import {
  appearancesAfterFinal,
  knowledgeTiming,
  stateOverlaps,
  type CheckState,
  type KnowledgeItemInput,
  type PassageUse,
} from './stateKnowledge'

const cal = gregorianCalendar('cal')
const d = (year: number, month = 0, day = 1): CalendarDate => ({ year, month, day })
const on = (date: CalendarDate): Position => ({ date })
const at = (timelineId: string, nodeId: string): Position => ({ node: { timelineId, nodeId } })

const tl = (nodes: [string, CalendarDate?][], pairs: [string, string][]): OrderTimeline => ({
  nodes: nodes.map(([id, date]) => ({ id, date: date ?? null })),
  edges: pairs.map(([from, to], i) => ({ id: `e${i}`, from, to })),
})
// t: undated path a -> b -> c -> e; u: separate undated timeline
const timelines: Record<string, OrderTimeline> = {
  t: tl([['a'], ['b'], ['c'], ['e']], [['a', 'b'], ['b', 'c'], ['c', 'e']]),
  u: tl([['x'], ['y']], []),
}
const ctx: OrderContext = { calendar: cal, timeline: (id) => timelines[id] }

const kinds = [
  { id: 'loc', name: 'Location', exclusive: true },
  { id: 'tag', name: 'Tag', exclusive: false },
]
const entryLabel = (id: string) => `Entry ${id}`
const valueLabel = (s: CheckState) => s.value

const st = (
  id: string,
  from: Position,
  until: Position | null,
  o: Partial<CheckState> = {},
): CheckState => ({ id, entryId: 'e1', kindId: 'loc', value: id.toUpperCase(), from, until, final: false, ...o })

const run = (states: CheckState[]) => stateOverlaps({ states, kinds, entryLabel, valueLabel }, ctx)

describe('stateOverlaps', () => {
  it('flags an overlapping pair once, with entry location naming kind and values', () => {
    const out = run([st('s1', on(d(1)), on(d(10))), st('s2', on(d(5)), on(d(20)))])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'state-overlap:s1:s2',
      checkId: 'state-overlap',
      severity: 'warning',
      locations: [{ kind: 'entry', id: 'e1', label: 'Location: S1 / S2' }],
    })
    expect(out[0].message).toContain('Entry e1')
  })

  it('touching boundary is not an overlap', () => {
    expect(run([st('s1', on(d(1)), on(d(10))), st('s2', on(d(10)), on(d(20)))])).toEqual([])
  })

  it('open-ended period overlaps a later start', () => {
    expect(run([st('s1', on(d(1)), null), st('s2', on(d(50)), on(d(60)))])).toHaveLength(1)
  })

  it('open-ended period does not overlap an earlier finished one', () => {
    expect(run([st('s1', on(d(50)), null), st('s2', on(d(1)), on(d(10)))])).toEqual([])
  })

  it('unknown order is never flagged', () => {
    expect(run([st('s1', at('t', 'a'), at('t', 'b')), st('s2', at('u', 'x'), at('u', 'y'))])).toEqual([])
    expect(run([st('s1', at('t', 'a'), null), st('s2', at('u', 'x'), null)])).toEqual([])
  })

  it('node-based overlap on one timeline is found', () => {
    expect(run([st('s1', at('t', 'a'), at('t', 'c')), st('s2', at('t', 'b'), at('t', 'e'))])).toHaveLength(1)
  })

  it('non-exclusive kinds are skipped', () => {
    const tags = [st('s1', on(d(1)), on(d(10)), { kindId: 'tag' }), st('s2', on(d(5)), on(d(20)), { kindId: 'tag' })]
    expect(run(tags)).toEqual([])
  })

  it('different entries do not overlap each other', () => {
    expect(run([st('s1', on(d(1)), on(d(10))), st('s2', on(d(5)), on(d(20)), { entryId: 'e2' })])).toEqual([])
  })

  it('id is the same whichever state comes first', () => {
    const a = st('s1', on(d(1)), on(d(10)))
    const b = st('s2', on(d(5)), on(d(20)))
    expect(run([a, b])[0].id).toBe(run([b, a])[0].id)
  })

  it('good case yields nothing', () => {
    expect(run([st('s1', on(d(1)), on(d(10))), st('s2', on(d(11)), null)])).toEqual([])
  })
})

describe('appearancesAfterFinal', () => {
  const finals = [st('f1', on(d(100)), null, { final: true, value: 'Dead' }), st('s2', on(d(1)), on(d(50)))]
  const use = (blockId: string, positions: Position[], entryId = 'e1'): PassageUse => ({
    blockId,
    sceneId: 'sc1',
    entryId,
    positions,
    label: `Passage ${blockId}`,
  })
  const run2 = (uses: PassageUse[], states = finals) =>
    appearancesAfterFinal({ states, uses, entryLabel, valueLabel }, ctx)

  it('flags a passage definitely after the final state starts', () => {
    const out = run2([use('b1', [on(d(200))])])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'appearance-after-final:b1:f1',
      checkId: 'appearance-after-final',
      severity: 'warning',
      locations: [
        { kind: 'scene', id: 'sc1', blockId: 'b1', label: 'Passage b1' },
        { kind: 'entry', id: 'e1', label: 'Entry e1' },
      ],
    })
  })

  it('at the start of the final state or before it is fine', () => {
    expect(run2([use('b1', [on(d(100))]), use('b2', [on(d(50))])])).toEqual([])
  })

  it('unknown order is not flagged', () => {
    const states = [st('f1', at('t', 'b'), null, { final: true })]
    expect(run2([use('b1', [at('u', 'x')])], states)).toEqual([])
  })

  it('a block with no position is skipped', () => {
    expect(run2([use('b1', [])])).toEqual([])
  })

  it('a block with one position still before the final is not flagged', () => {
    expect(run2([use('b1', [on(d(200)), on(d(10))])])).toEqual([])
  })

  it('only that entry\'s final state counts', () => {
    expect(run2([use('b1', [on(d(200))], 'e2')])).toEqual([])
  })

  it('no final state: nothing', () => {
    expect(run2([use('b1', [on(d(200))])], [st('s2', on(d(1)), null)])).toEqual([])
  })

  it('keeps the same ids on a re-run', () => {
    const uses = [use('b1', [on(d(200))]), use('b2', [on(d(300))])]
    const ids = () => run2(uses).map((f) => f.id)
    expect(ids()).toEqual(['appearance-after-final:b1:f1', 'appearance-after-final:b2:f1'])
    expect(ids()).toEqual(ids())
  })
})

describe('knowledgeTiming', () => {
  let n = 0
  const learn = (entryId: string, atPos: Position, forgottenAt: Position | null = null) => ({
    id: `l${n++}`,
    entryId,
    at: atPos,
    forgottenAt,
  })
  const item = (learnings: KnowledgeItemInput['learnings']): KnowledgeItemInput => ({
    id: 'k1',
    name: 'The secret',
    learnings,
  })
  const use = (blockId: string, positions: Position[], entryId = 'e1'): PassageUse & { itemId: string } => ({
    blockId,
    sceneId: 'sc1',
    itemId: 'k1',
    entryId,
    positions,
    label: `Passage ${blockId}`,
  })
  const run3 = (items: KnowledgeItemInput[], uses: ReturnType<typeof use>[]) =>
    knowledgeTiming({ items, uses, entryLabel }, ctx)

  it('flags a use before the entry learns the item', () => {
    const out = run3([item([learn('e1', on(d(100)))])], [use('b1', [on(d(50))])])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'knowledge-timing:b1:k1:e1',
      checkId: 'knowledge-timing',
      severity: 'warning',
      locations: [
        { kind: 'scene', id: 'sc1', blockId: 'b1', label: 'Passage b1' },
        { kind: 'entry', id: 'e1', label: 'Entry e1' },
      ],
    })
    expect(out[0].message).toContain('before')
    expect(out[0].message).toContain('The secret')
  })

  it('flags never learned', () => {
    const out = run3([item([learn('e2', on(d(1)))])], [use('b1', [on(d(50))])])
    expect(out).toHaveLength(1)
    expect(out[0].message).toContain('never learns')
  })

  it('flags a use after forgetting', () => {
    const out = run3([item([learn('e1', on(d(1)), on(d(10)))])], [use('b1', [on(d(50))])])
    expect(out).toHaveLength(1)
    expect(out[0].message).toContain('forgetting')
  })

  it('a re-learning after the forgetting makes a later use fine', () => {
    const ls = [learn('e1', on(d(1)), on(d(10))), learn('e1', on(d(30)))]
    expect(run3([item(ls)], [use('b1', [on(d(50))])])).toEqual([])
    expect(run3([item(ls)], [use('b2', [on(d(20))])])).toHaveLength(1)
  })

  it('use at the learning position and while known is fine', () => {
    const ls = [learn('e1', on(d(10)), on(d(20)))]
    expect(run3([item(ls)], [use('b1', [on(d(10))]), use('b2', [on(d(15))]), use('b3', [on(d(20))])])).toEqual([])
  })

  it('unknown order is never flagged', () => {
    const ls = [learn('e1', at('u', 'x'), at('u', 'y'))]
    expect(run3([item(ls)], [use('b1', [at('t', 'e')])])).toEqual([])
  })

  it('a block with no position is skipped, even if never learned', () => {
    expect(run3([item([])], [use('b1', [])])).toEqual([])
  })

  it('a use of a missing item is skipped (broken-link check covers it)', () => {
    expect(run3([], [use('b1', [on(d(50))])])).toEqual([])
  })

  it('several positions: flagged only when every position is a problem', () => {
    const ls = [learn('e1', on(d(100)))]
    expect(run3([item(ls)], [use('b1', [on(d(10)), on(d(20))])])).toHaveLength(1)
    expect(run3([item(ls)], [use('b2', [on(d(10)), on(d(200))])])).toEqual([])
  })

  it('other entries\' learnings do not count', () => {
    const ls = [learn('e2', on(d(1)))]
    expect(run3([item(ls)], [use('b1', [on(d(50))])])[0].message).toContain('never learns')
  })

  it('good case yields nothing; ids are stable on re-run', () => {
    expect(run3([item([learn('e1', on(d(1)))])], [use('b1', [on(d(50))])])).toEqual([])
    const bad = [use('b1', [on(d(0))]), use('b2', [on(d(0))], 'e1')]
    const ids = () => run3([item([learn('e1', on(d(1)))])], bad).map((f) => f.id)
    expect(ids()).toEqual(['knowledge-timing:b1:k1:e1', 'knowledge-timing:b2:k1:e1'])
    expect(ids()).toEqual(ids())
  })
})
