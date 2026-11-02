import { describe, expect, it } from 'vitest'
import { gregorianCalendar, type CalendarDate } from '../calendar'
import type { OrderContext, OrderTimeline, Position } from '../timeline/order'
import {
  knowledgeMatrix,
  knowsAsOf,
  usedBeforeLearned,
  whoKnowsAsOf,
  type LearningLike,
} from './logic'

const cal = gregorianCalendar('cal')
const d = (year: number, month = 0, day = 1): CalendarDate => ({ year, month, day })
const on = (date: CalendarDate): Position => ({ date })
const at = (timelineId: string, nodeId: string): Position => ({ node: { timelineId, nodeId } })

const tl = (nodes: [string, CalendarDate?][], pairs: [string, string][]): OrderTimeline => ({
  nodes: nodes.map(([id, date]) => ({ id, date: date ?? null })),
  edges: pairs.map(([from, to], i) => ({ id: `e${i}`, from, to })),
})
// t: undated path a -> b -> c -> e; p(1000) q(2000) dated; u: separate undated timeline
const timelines: Record<string, OrderTimeline> = {
  t: tl(
    [['a'], ['b'], ['c'], ['e'], ['p', d(1000)], ['q', d(2000)]],
    [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'e'],
    ],
  ),
  u: tl([['x'], ['y']], []),
}
const ctx: OrderContext = { calendar: cal, timeline: (id) => timelines[id] }

let n = 0
const learn = (
  entryId: string,
  atPos: Position,
  forgottenAt: Position | null = null,
): LearningLike => ({ id: `l${n++}`, entryId, at: atPos, forgottenAt })

describe('knowsAsOf', () => {
  it('no learnings: not-yet', () => {
    expect(knowsAsOf([], at('t', 'b'), ctx)).toBe('not-yet')
  })

  it('before learning: not-yet', () => {
    expect(knowsAsOf([learn('e1', at('t', 'c'))], at('t', 'a'), ctx)).toBe('not-yet')
  })

  it('learned at the position: known (boundary)', () => {
    expect(knowsAsOf([learn('e1', at('t', 'b'))], at('t', 'b'), ctx)).toBe('known')
  })

  it('after learning with no forgetting: known', () => {
    expect(knowsAsOf([learn('e1', at('t', 'a'))], at('t', 'e'), ctx)).toBe('known')
  })

  it('before forgetting: known', () => {
    expect(knowsAsOf([learn('e1', at('t', 'a'), at('t', 'c'))], at('t', 'b'), ctx)).toBe('known')
  })

  it('forgotten at the position: forgotten (boundary)', () => {
    expect(knowsAsOf([learn('e1', at('t', 'a'), at('t', 'c'))], at('t', 'c'), ctx)).toBe(
      'forgotten',
    )
  })

  it('after forgetting: forgotten', () => {
    expect(knowsAsOf([learn('e1', at('t', 'a'), at('t', 'b'))], at('t', 'e'), ctx)).toBe(
      'forgotten',
    )
  })

  it('unknown order to the learning: unknown, never guessed', () => {
    expect(knowsAsOf([learn('e1', at('u', 'x'))], at('t', 'b'), ctx)).toBe('unknown')
  })

  it('learned, then unknown order to the forgetting: unknown', () => {
    expect(knowsAsOf([learn('e1', at('t', 'a'), at('u', 'y'))], at('t', 'b'), ctx)).toBe('unknown')
  })

  it('dates: before, at and after', () => {
    const l = learn('e1', on(d(1500)))
    expect(knowsAsOf([l], on(d(1400)), ctx)).toBe('not-yet')
    expect(knowsAsOf([l], on(d(1500)), ctx)).toBe('known')
    expect(knowsAsOf([l], on(d(1600)), ctx)).toBe('known')
  })

  it('a date against a dated node', () => {
    expect(knowsAsOf([learn('e1', at('t', 'p'))], on(d(1500)), ctx)).toBe('known')
    expect(knowsAsOf([learn('e1', at('t', 'q'))], on(d(1500)), ctx)).toBe('not-yet')
  })

  it('a date against an undated node: unknown', () => {
    expect(knowsAsOf([learn('e1', at('t', 'a'))], on(d(1500)), ctx)).toBe('unknown')
  })

  it('a node on another timeline: unknown', () => {
    expect(knowsAsOf([learn('e1', at('t', 'a'))], at('u', 'x'), ctx)).toBe('unknown')
  })

  it('relearning after forgetting: known again', () => {
    const ls = [learn('e1', at('t', 'a'), at('t', 'b')), learn('e1', at('t', 'c'))]
    expect(knowsAsOf(ls, at('t', 'b'), ctx)).toBe('forgotten')
    expect(knowsAsOf(ls, at('t', 'e'), ctx)).toBe('known')
  })

  it('known wins over unknown; unknown wins over forgotten; forgotten wins over not-yet', () => {
    const known = learn('e1', at('t', 'a'))
    const unk = learn('e1', at('u', 'x'))
    const forg = learn('e1', at('t', 'a'), at('t', 'b'))
    const notYet = learn('e1', at('t', 'e'))
    expect(knowsAsOf([unk, known], at('t', 'c'), ctx)).toBe('known')
    expect(knowsAsOf([forg, unk], at('t', 'c'), ctx)).toBe('unknown')
    expect(knowsAsOf([notYet, forg], at('t', 'c'), ctx)).toBe('forgotten')
    expect(knowsAsOf([notYet, notYet], at('t', 'c'), ctx)).toBe('not-yet')
  })
})

describe('whoKnowsAsOf', () => {
  it('one row per distinct learner, in first-learning order', () => {
    const item = {
      id: 'i1',
      learnings: [learn('e2', at('t', 'a')), learn('e1', at('t', 'b')), learn('e2', at('t', 'c'))],
    }
    expect(whoKnowsAsOf(item, at('t', 'e'), ctx)).toEqual([
      { entryId: 'e2', state: 'known' },
      { entryId: 'e1', state: 'known' },
    ])
  })

  it('states are per learner', () => {
    const item = {
      id: 'i1',
      learnings: [learn('e1', at('t', 'a'), at('t', 'b')), learn('e2', at('t', 'e'))],
    }
    expect(whoKnowsAsOf(item, at('t', 'c'), ctx)).toEqual([
      { entryId: 'e1', state: 'forgotten' },
      { entryId: 'e2', state: 'not-yet' },
    ])
  })

  it('no learnings: empty', () => {
    expect(whoKnowsAsOf({ id: 'i1', learnings: [] }, at('t', 'a'), ctx)).toEqual([])
  })
})

describe('knowledgeMatrix', () => {
  const l1 = learn('e1', at('t', 'b'))
  const l2 = learn('e2', at('t', 'e'))
  const items = [
    { id: 'i1', learnings: [l1, l2] },
    { id: 'i2', learnings: [] },
  ]

  it('rows follow the entry order, cells the item order', () => {
    const m = knowledgeMatrix(['e2', 'e1'], items, at('t', 'c'), ctx)
    expect(m.map((r) => r.entryId)).toEqual(['e2', 'e1'])
    expect(m[0].cells.map((c) => c.itemId)).toEqual(['i1', 'i2'])
  })

  it('cells carry the entry learnings and the state as of the position', () => {
    const m = knowledgeMatrix(['e1', 'e2'], items, at('t', 'c'), ctx)
    expect(m[0].cells[0]).toEqual({ itemId: 'i1', learnings: [l1], state: 'known' })
    expect(m[1].cells[0]).toEqual({ itemId: 'i1', learnings: [l2], state: 'not-yet' })
  })

  it('no learning of the item at all: none', () => {
    const m = knowledgeMatrix(['e1'], items, at('t', 'c'), ctx)
    expect(m[0].cells[1]).toEqual({ itemId: 'i2', learnings: [], state: 'none' })
  })

  it('without an as-of position: known when there is any learning, no timing', () => {
    const m = knowledgeMatrix(['e1', 'e2'], items, null, ctx)
    expect(m[0].cells[0].state).toBe('known')
    expect(m[1].cells[0].state).toBe('known')
    expect(m[1].cells[1].state).toBe('none')
  })
})

describe('usedBeforeLearned', () => {
  const blocks = [
    { id: 'b1', position: at('t', 'a') },
    { id: 'b2', position: at('t', 'b') },
    { id: 'b3', position: at('t', 'e') },
  ]

  it('never learned: every block is flagged', () => {
    expect(usedBeforeLearned([], blocks, ctx)).toEqual([
      { blockId: 'b1', reason: 'never-learned' },
      { blockId: 'b2', reason: 'never-learned' },
      { blockId: 'b3', reason: 'never-learned' },
    ])
  })

  it('only blocks strictly before the learning are flagged; equal and after are not', () => {
    expect(usedBeforeLearned([learn('e1', at('t', 'b'))], blocks, ctx)).toEqual([
      { blockId: 'b1', reason: 'before-learning' },
    ])
  })

  it('unknown order is not flagged', () => {
    expect(usedBeforeLearned([learn('e1', at('u', 'x'))], blocks, ctx)).toEqual([])
  })

  it('relearning: flagged only when before every learning', () => {
    const ls = [learn('e1', at('t', 'e')), learn('e1', at('t', 'b'))]
    expect(usedBeforeLearned(ls, blocks, ctx)).toEqual([
      { blockId: 'b1', reason: 'before-learning' },
    ])
  })

  it('one unknown learning protects a block that is before the other', () => {
    const ls = [learn('e1', at('t', 'e')), learn('e1', at('u', 'x'))]
    expect(usedBeforeLearned(ls, blocks, ctx)).toEqual([])
  })

  it('forgetting does not matter here', () => {
    const ls = [learn('e1', at('t', 'a'), at('t', 'b'))]
    expect(usedBeforeLearned(ls, blocks, ctx)).toEqual([])
  })

  it('no blocks: nothing', () => {
    expect(usedBeforeLearned([], [], ctx)).toEqual([])
  })
})
