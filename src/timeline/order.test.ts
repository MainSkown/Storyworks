import { describe, expect, it } from 'vitest'
import { gregorianCalendar, type CalendarDate } from '../calendar'
import { compare, type OrderContext, type OrderTimeline, type Position } from './order'

const cal = gregorianCalendar('cal')
const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day })

type N = [id: string, date?: CalendarDate | null]
const tl = (nodes: N[], pairs: [string, string][]): OrderTimeline => ({
  nodes: nodes.map(([id, date]) => ({ id, date: date ?? null })),
  edges: pairs.map(([from, to], i) => ({ id: `e${i}`, from, to })),
})
const ctxOf = (timelines: Record<string, OrderTimeline>): OrderContext => ({
  calendar: cal,
  timeline: (id) => timelines[id],
})
const at = (timelineId: string, nodeId: string): Position => ({ node: { timelineId, nodeId } })
const on = (date: CalendarDate): Position => ({ date })

// a -> b -> c, a -> x (branch, no path to/from b or c), plus undated y -> z
const main = tl(
  [['a'], ['b'], ['c'], ['x'], ['y'], ['z']],
  [['a', 'b'], ['b', 'c'], ['a', 'x'], ['y', 'z']],
)

describe('compare: dates', () => {
  const ctx = ctxOf({
    t: tl([['p', d(2000, 0, 1)], ['q', d(2000, 5, 1)], ['r', d(2000, 0, 1)]], []),
  })
  it('both dated: before, after, equal', () => {
    expect(compare(at('t', 'p'), at('t', 'q'), ctx)).toBe('before')
    expect(compare(at('t', 'q'), at('t', 'p'), ctx)).toBe('after')
    expect(compare(at('t', 'p'), at('t', 'r'), ctx)).toBe('equal')
  })
  it('dated nodes on different timelines are ordered by date', () => {
    const c = ctxOf({ t1: tl([['p', d(2000, 0, 1)]], []), t2: tl([['q', d(1999, 0, 1)]], []) })
    expect(compare(at('t1', 'p'), at('t2', 'q'), c)).toBe('after')
  })
  it('node vs plain date', () => {
    expect(compare(at('t', 'p'), on(d(2001, 0, 1)), ctx)).toBe('before')
    expect(compare(on(d(2001, 0, 1)), at('t', 'q'), ctx)).toBe('after')
    expect(compare(on(d(2000, 5, 1)), at('t', 'q'), ctx)).toBe('equal')
  })
  it('two plain dates', () => {
    expect(compare(on(d(1, 0, 1)), on(d(2, 0, 1)), ctx)).toBe('before')
  })
  it('undated node vs plain date is unknown', () => {
    expect(compare(at('t', 'u'), on(d(2000, 0, 1)), ctxOf({ t: main }))).toBe('unknown')
    expect(compare(at('t', 'a'), on(d(2000, 0, 1)), ctxOf({ t: main }))).toBe('unknown')
  })
  it('two invalid plain dates are unknown', () => {
    expect(compare(on(d(2000, 1, 30)), on(d(2000, 0, 1)), ctx)).toBe('unknown')
  })
})

describe('compare: path', () => {
  const ctx = ctxOf({ t: main })
  it('undated pair on a path', () => {
    expect(compare(at('t', 'a'), at('t', 'c'), ctx)).toBe('before')
    expect(compare(at('t', 'c'), at('t', 'a'), ctx)).toBe('after')
    expect(compare(at('t', 'b'), at('t', 'c'), ctx)).toBe('before')
  })
  it('same node is equal', () => {
    expect(compare(at('t', 'b'), at('t', 'b'), ctx)).toBe('equal')
  })
  it('dated vs undated on a path uses the path', () => {
    const c = ctxOf({ t: tl([['a', d(2000, 0, 1)], ['b']], [['a', 'b']]) })
    expect(compare(at('t', 'a'), at('t', 'b'), c)).toBe('before')
  })
  it('different branches with no path are unknown', () => {
    expect(compare(at('t', 'x'), at('t', 'b'), ctx)).toBe('unknown')
    expect(compare(at('t', 'y'), at('t', 'a'), ctx)).toBe('unknown')
  })
  it('different timelines, undated, are unknown', () => {
    const c = ctxOf({ t1: tl([['a']], []), t2: tl([['a']], []) })
    expect(compare(at('t1', 'a'), at('t2', 'a'), c)).toBe('unknown')
  })
  it('missing timeline or node is unknown', () => {
    expect(compare(at('nope', 'a'), at('nope', 'b'), ctx)).toBe('unknown')
    expect(compare(at('t', 'a'), at('t', 'ghost'), ctx)).toBe('unknown')
  })
})

describe('compare: precedence and fallbacks', () => {
  it('invalid date falls back to the path', () => {
    const c = ctxOf({ t: tl([['a', d(2000, 1, 30)], ['b', d(1990, 0, 1)]], [['a', 'b']]) })
    expect(compare(at('t', 'a'), at('t', 'b'), c)).toBe('before')
  })
  it('invalid date with no path is unknown', () => {
    const c = ctxOf({ t: tl([['a', d(2000, 1, 30)], ['b', d(1990, 0, 1)]], []) })
    expect(compare(at('t', 'a'), at('t', 'b'), c)).toBe('unknown')
  })
  it('date contradicting the path wins', () => {
    const c = ctxOf({ t: tl([['a', d(2000, 0, 1)], ['b', d(1990, 0, 1)]], [['a', 'b']]) })
    expect(compare(at('t', 'a'), at('t', 'b'), c)).toBe('after')
  })
  it('equal dates on a path stay equal', () => {
    const c = ctxOf({ t: tl([['a', d(2000, 0, 1)], ['b', d(2000, 0, 1)]], [['a', 'b']]) })
    expect(compare(at('t', 'a'), at('t', 'b'), c)).toBe('equal')
  })
  it('uses the calendar passed in the context', () => {
    // 30 Feb is valid in a calendar with a 30-day month 1
    const custom = { ...cal, months: cal.months.map((m, i) => (i === 1 ? { ...m, days: 30 } : m)) }
    const c: OrderContext = { calendar: custom, timeline: () => undefined }
    expect(compare(on(d(2000, 1, 30)), on(d(2000, 2, 1)), c)).toBe('before')
  })
})

describe('compare: mirror property', () => {
  const timelines = {
    t: tl(
      [['a'], ['b'], ['c', d(2000, 0, 1)], ['x'], ['q', d(1990, 0, 1)], ['bad', d(2000, 1, 30)]],
      [['a', 'b'], ['b', 'c'], ['a', 'x'], ['a', 'bad']],
    ),
    u: tl([['a']], []),
  }
  const ctx = ctxOf(timelines)
  const positions: Position[] = [
    ...Object.entries(timelines).flatMap(([tid, t]) => t.nodes.map((n) => at(tid, n.id))),
    at('t', 'ghost'),
    on(d(1995, 3, 3)),
    on(d(2000, 0, 1)),
    on(d(2000, 1, 30)),
  ]
  const flip = { before: 'after', after: 'before', equal: 'equal', unknown: 'unknown' } as const
  it('compare(a, b) mirrors compare(b, a) for every pair', () => {
    for (const a of positions)
      for (const b of positions) expect(compare(a, b, ctx)).toBe(flip[compare(b, a, ctx)])
  })
})

describe('compare: cache', () => {
  it('sees a new edge when the timeline is replaced', () => {
    const t1 = tl([['a'], ['b']], [])
    expect(compare(at('t', 'a'), at('t', 'b'), ctxOf({ t: t1 }))).toBe('unknown')
    const t2 = { ...t1, edges: [{ id: 'e', from: 'a', to: 'b' }] }
    expect(compare(at('t', 'a'), at('t', 'b'), ctxOf({ t: t2 }))).toBe('before')
  })
  it('sees a removed edge when the timeline is replaced', () => {
    const t1 = tl([['a'], ['b']], [['a', 'b']])
    expect(compare(at('t', 'a'), at('t', 'b'), ctxOf({ t: t1 }))).toBe('before')
    const t2 = { ...t1, edges: [] }
    expect(compare(at('t', 'a'), at('t', 'b'), ctxOf({ t: t2 }))).toBe('unknown')
  })
  it('sees a changed node date when only nodes are replaced', () => {
    const t1 = tl([['a', d(2000, 0, 1)], ['b', d(2001, 0, 1)]], [])
    expect(compare(at('t', 'a'), at('t', 'b'), ctxOf({ t: t1 }))).toBe('before')
    const t2 = { ...t1, nodes: [{ id: 'a', date: d(2005, 0, 1) }, t1.nodes[1]] }
    expect(compare(at('t', 'a'), at('t', 'b'), ctxOf({ t: t2 }))).toBe('after')
  })
})
