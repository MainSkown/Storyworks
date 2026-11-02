import { describe, expect, it } from 'vitest'
import { gregorianCalendar, type CalendarDate } from '../calendar'
import type { OrderContext, OrderTimeline, Position } from './order'
import { sortChronological, sortChronologicalDetailed } from './chrono'

const cal = gregorianCalendar('cal')
const d = (year: number, month = 0, day = 1): CalendarDate => ({ year, month, day })
const on = (date: CalendarDate): Position => ({ date })
const at = (timelineId: string, nodeId: string): Position => ({ node: { timelineId, nodeId } })
const tl = (nodes: [string, CalendarDate?][], pairs: [string, string][] = []): OrderTimeline => ({
  nodes: nodes.map(([id, date]) => ({ id, date: date ?? null })),
  edges: pairs.map(([from, to], i) => ({ id: `e${i}`, from, to })),
})
const ctxOf = (timelines: Record<string, OrderTimeline>): OrderContext => ({
  calendar: cal,
  timeline: (id) => timelines[id],
})
type It = { key: string; position: Position | null; rank: number }
const IT = (key: string, position: Position | null, rank = 0): It => ({ key, position, rank })
const keys = (items: It[], ctx: OrderContext) => sortChronological(items, ctx)

describe('sortChronological', () => {
  const none = ctxOf({})

  it('empty input', () => {
    expect(keys([], none)).toEqual([])
  })

  it('all dated: calendar order whatever the input order or rank', () => {
    const r = keys([IT('c', on(d(30)), 0), IT('a', on(d(10)), 2), IT('b', on(d(20)), 1)], none)
    expect(r).toEqual(['a', 'b', 'c'])
  })

  it('dated node and plain date are ordered together', () => {
    const ctx = ctxOf({ t: tl([['n', d(20)]]) })
    expect(keys([IT('n', at('t', 'n')), IT('early', on(d(10))), IT('late', on(d(30)))], ctx)).toEqual(['early', 'n', 'late'])
  })

  it('undated items on a path are placed by the path relative to dated ones', () => {
    const ctx = ctxOf({
      t: tl([['n1', d(1000)], ['u', undefined], ['n3', d(2000)], ['u2', undefined]], [['n1', 'u'], ['u', 'n3'], ['n3', 'u2']]),
    })
    const r = keys([IT('u2', at('t', 'u2')), IT('n3', at('t', 'n3')), IT('u', at('t', 'u')), IT('n1', at('t', 'n1'))], ctx)
    expect(r).toEqual(['n1', 'u', 'n3', 'u2'])
  })

  it('undated path pair is ordered by the path, not by rank', () => {
    const ctx = ctxOf({ t: tl([['a'], ['b']], [['a', 'b']]) })
    expect(keys([IT('b', at('t', 'b'), 0), IT('a', at('t', 'a'), 1)], ctx)).toEqual(['a', 'b'])
  })

  it('unrelated undated items go after determined ones, in rank order then input order', () => {
    const ctx = ctxOf({ t1: tl([['x']]), t2: tl([['y']]), t3: tl([['z']]) })
    const r = keys(
      [IT('z', at('t3', 'z'), 1), IT('x', at('t1', 'x'), 2), IT('dated', on(d(5)), 9), IT('y', at('t2', 'y'), 1)],
      ctx,
    )
    expect(r).toEqual(['dated', 'z', 'y', 'x'])
  })

  it('equal dates keep rank order, then input order', () => {
    const r = keys([IT('b', on(d(5)), 2), IT('a', on(d(5)), 1), IT('c', on(d(5)), 2)], none)
    expect(r).toEqual(['a', 'b', 'c'])
  })

  it('null position is last, after undetermined items, in rank order', () => {
    const ctx = ctxOf({ t: tl([['x']]) })
    const r = keys([IT('none1', null, 0), IT('x', at('t', 'x'), 5), IT('dated', on(d(1)), 9), IT('none2', null, -1)], ctx)
    expect(r).toEqual(['dated', 'x', 'none2', 'none1'])
  })

  it('a missing node is undetermined', () => {
    const ctx = ctxOf({ t: tl([['n', d(1)]]) })
    expect(keys([IT('gone', at('t', 'gone'), 0), IT('n', at('t', 'n'), 1)], ctx)).toEqual(['n', 'gone'])
  })

  it('an invalid date is not a date', () => {
    expect(keys([IT('bad', on(d(2000, 1, 40)), 0), IT('ok', on(d(1)), 1)], none)).toEqual(['ok', 'bad'])
  })

  it('a cycle in the relation does not throw and keeps every item once', () => {
    // A(2010) -> U -> C(2005) by path, but C is before A by date
    const ctx = ctxOf({ t: tl([['A', d(2010)], ['U'], ['C', d(2005)]], [['A', 'U'], ['U', 'C']]) })
    const r = keys([IT('A', at('t', 'A')), IT('U', at('t', 'U')), IT('C', at('t', 'C'))], ctx)
    expect(r).toEqual(['C', 'A', 'U'])
  })

  it('does not change the input', () => {
    const items = [IT('b', on(d(2))), IT('a', on(d(1)))]
    keys(items, none)
    expect(items.map((x) => x.key)).toEqual(['b', 'a'])
  })

  it('500 items sort quickly', () => {
    const nodes: [string, CalendarDate?][] = []
    const edges: [string, string][] = []
    for (let i = 0; i < 250; i++) {
      nodes.push([`n${i}`, i % 2 ? d(1000 + i) : undefined])
      if (i) edges.push([`n${i - 1}`, `n${i}`])
    }
    const ctx = ctxOf({ t: tl(nodes, edges) })
    const items: It[] = []
    for (let i = 249; i >= 0; i--) items.push(IT(`n${i}`, at('t', `n${i}`), i))
    for (let i = 0; i < 250; i++) items.push(IT(`d${i}`, on(d(5000 - i)), i))
    const t0 = performance.now()
    const r = sortChronological(items, ctx)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(r).toHaveLength(500)
    expect(r.indexOf('n10')).toBeLessThan(r.indexOf('n11'))
  })
})

describe('sortChronologicalDetailed', () => {
  it('same order as sortChronological, flagging where the unknown order starts', () => {
    const ctx = ctxOf({ t: tl([['a', d(1)], ['mid'], ['b', d(3)], ['x']], [['a', 'mid'], ['mid', 'b']]) })
    const items = [IT('x', at('t', 'x'), 0), IT('b', at('t', 'b'), 1), IT('mid', at('t', 'mid'), 2), IT('a', at('t', 'a'), 3), IT('none', null, 4)]
    const r = sortChronologicalDetailed(items, ctx)
    expect(r.map((x) => x.key)).toEqual(sortChronological(items, ctx))
    expect(r.map((x) => [x.key, x.determined])).toEqual([['a', true], ['mid', true], ['b', true], ['x', false], ['none', false]])
  })
})
