import { describe, expect, it } from 'vitest'
import { gregorianCalendar, type CalendarDate } from '../calendar'
import type { OrderContext, OrderTimeline, Position } from '../timeline/order'
import { appearsAfterFinal, overlappingStates, type KindLike, type StateLike } from './stateChecks'

const cal = gregorianCalendar('cal')
const d = (year: number, month = 0, day = 1): CalendarDate => ({ year, month, day })
const on = (date: CalendarDate): Position => ({ date })
const at = (timelineId: string, nodeId: string): Position => ({ node: { timelineId, nodeId } })

const tl = (nodes: [string, CalendarDate?][], pairs: [string, string][]): OrderTimeline => ({
  nodes: nodes.map(([id, date]) => ({ id, date: date ?? null })),
  edges: pairs.map(([from, to], i) => ({ id: `e${i}`, from, to })),
})
// t: undated path a -> b -> c; dated: p(1000) q(2000); u: undated, other timeline
const timelines: Record<string, OrderTimeline> = {
  t: tl([['a'], ['b'], ['c'], ['p', d(1000)], ['q', d(2000)]], [['a', 'b'], ['b', 'c']]),
  u: tl([['x'], ['y']], []),
}
const ctx: OrderContext = { calendar: cal, timeline: (id) => timelines[id] }

const kinds: KindLike[] = [
  { id: 'loc', exclusive: true },
  { id: 'own', exclusive: true },
  { id: 'tag', exclusive: false },
]
let n = 0
const st = (kindId: string, from: Position, until: Position | null, final = false): StateLike => ({
  id: `s${n++}`,
  kindId,
  value: 'v',
  from,
  until,
  final,
})
const ids = (r: { a: StateLike; b: StateLike }[]) => r.map((x) => [x.a.id, x.b.id])

describe('overlappingStates', () => {
  it('overlapping dated periods are found, with kind', () => {
    const a = st('loc', on(d(1)), on(d(10)))
    const b = st('loc', on(d(5)), on(d(20)))
    const r = overlappingStates([a, b], kinds, ctx)
    expect(r).toEqual([{ kindId: 'loc', a, b }])
  })

  it('touching at the boundary is no overlap (date and node)', () => {
    expect(overlappingStates([st('loc', on(d(1)), on(d(5))), st('loc', on(d(5)), on(d(9)))], kinds, ctx)).toEqual([])
    expect(overlappingStates([st('loc', at('t', 'a'), at('t', 'b')), st('loc', at('t', 'b'), at('t', 'c'))], kinds, ctx)).toEqual([])
  })

  it('touching in the other array order is no overlap either', () => {
    expect(overlappingStates([st('loc', on(d(5)), on(d(9))), st('loc', on(d(1)), on(d(5)))], kinds, ctx)).toEqual([])
  })

  it('open-ended state overlaps a later one', () => {
    const a = st('loc', on(d(1)), null)
    const b = st('loc', on(d(50)), on(d(60)))
    expect(ids(overlappingStates([a, b], kinds, ctx))).toEqual([[a.id, b.id]])
  })

  it('open-ended state does not overlap one that ended before it began', () => {
    const a = st('loc', on(d(50)), null)
    const b = st('loc', on(d(1)), on(d(10)))
    expect(overlappingStates([a, b], kinds, ctx)).toEqual([])
  })

  it('both open overlap', () => {
    const a = st('loc', on(d(1)), null)
    const b = st('loc', on(d(5)), null)
    expect(ids(overlappingStates([a, b], kinds, ctx))).toEqual([[a.id, b.id]])
  })

  it('non-exclusive kinds and unknown kinds never overlap', () => {
    expect(overlappingStates([st('tag', on(d(1)), null), st('tag', on(d(2)), null)], kinds, ctx)).toEqual([])
    expect(overlappingStates([st('zzz', on(d(1)), null), st('zzz', on(d(2)), null)], kinds, ctx)).toEqual([])
  })

  it('different kinds never overlap', () => {
    expect(overlappingStates([st('loc', on(d(1)), null), st('own', on(d(2)), null)], kinds, ctx)).toEqual([])
  })

  it('unknown order is never flagged', () => {
    // different timelines, undated
    expect(overlappingStates([st('loc', at('t', 'a'), at('t', 'c')), st('loc', at('u', 'x'), at('u', 'y'))], kinds, ctx)).toEqual([])
    // undated node vs date
    expect(overlappingStates([st('loc', at('t', 'a'), null), st('loc', on(d(5)), null)], kinds, ctx)).toEqual([])
    // missing node
    expect(overlappingStates([st('loc', at('t', 'gone'), null), st('loc', at('t', 'a'), null)], kinds, ctx)).toEqual([])
  })

  it('node periods on one path overlap when they cross', () => {
    const a = st('loc', at('t', 'a'), at('t', 'c'))
    const b = st('loc', at('t', 'b'), at('t', 'c'))
    expect(ids(overlappingStates([a, b], kinds, ctx))).toEqual([[a.id, b.id]])
  })

  it('mixes dated nodes and plain dates', () => {
    const a = st('loc', at('t', 'p'), at('t', 'q')) // 1000..2000
    expect(overlappingStates([a, st('loc', on(d(1500)), null)], kinds, ctx)).toHaveLength(1)
    expect(overlappingStates([a, st('loc', on(d(2000)), null)], kinds, ctx)).toEqual([])
  })

  it('empty period (from equals until) is ignored', () => {
    const empty = st('loc', on(d(5)), on(d(5)))
    expect(overlappingStates([empty, st('loc', on(d(1)), on(d(10)))], kinds, ctx)).toEqual([])
    const emptyNode = st('loc', at('t', 'b'), at('t', 'b'))
    expect(overlappingStates([emptyNode, st('loc', at('t', 'a'), at('t', 'c'))], kinds, ctx)).toEqual([])
  })

  it('reversed period is ignored', () => {
    const bad = st('loc', on(d(10)), on(d(1)))
    expect(overlappingStates([bad, st('loc', on(d(0)), on(d(20)))], kinds, ctx)).toEqual([])
  })

  it('each pair once, ordered by array index', () => {
    const s = [st('loc', on(d(1)), null), st('own', on(d(1)), null), st('loc', on(d(2)), null), st('loc', on(d(3)), null)]
    expect(ids(overlappingStates(s, kinds, ctx))).toEqual([
      [s[0].id, s[2].id],
      [s[0].id, s[3].id],
      [s[2].id, s[3].id],
    ])
  })
})

describe('appearsAfterFinal', () => {
  const item = (id: string, position: Position) => ({ id, position })

  it('flags positions definitely after the final state start', () => {
    const fin = st('loc', at('t', 'b'), null, true)
    const late = item('late', at('t', 'c'))
    expect(appearsAfterFinal([fin], [late, item('early', at('t', 'a'))], ctx)).toEqual([{ item: late, state: fin }])
  })

  it('equal position is not flagged', () => {
    expect(appearsAfterFinal([st('loc', at('t', 'b'), null, true)], [item('same', at('t', 'b'))], ctx)).toEqual([])
    expect(appearsAfterFinal([st('loc', on(d(5)), null, true)], [item('same', on(d(5)))], ctx)).toEqual([])
  })

  it('unknown order is not flagged', () => {
    expect(appearsAfterFinal([st('loc', at('t', 'b'), null, true)], [item('x', at('u', 'x')), item('d', on(d(5)))], ctx)).toEqual([])
  })

  it('non-final states are ignored', () => {
    expect(appearsAfterFinal([st('loc', on(d(1)), null)], [item('x', on(d(9)))], ctx)).toEqual([])
  })

  it('date versus dated node', () => {
    const fin = st('loc', at('t', 'p'), null, true) // 1000
    const x = item('x', on(d(1500)))
    expect(appearsAfterFinal([fin], [x], ctx)).toEqual([{ item: x, state: fin }])
  })

  it('each position once, with the first triggering final state', () => {
    const f1 = st('loc', on(d(1)), null, true)
    const f2 = st('own', on(d(2)), null, true)
    const x = item('x', on(d(9)))
    expect(appearsAfterFinal([f1, f2], [x], ctx)).toEqual([{ item: x, state: f1 }])
  })
})
