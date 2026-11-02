import { describe, expect, it } from 'vitest'
import { gregorianCalendar, type CalendarDate } from '../calendar'
import type { OrderContext, OrderTimeline, Position } from '../timeline/order'
import {
  chronicleKnowledgeEvents,
  entryKnowledgeAsOf,
  filterItems,
  forgottenBeforeLearned,
  orderLearningRows,
  type EntryLearningRow,
} from './view'

const cal = gregorianCalendar('cal')
const d = (year: number): CalendarDate => ({ year, month: 0, day: 1 })
const on = (year: number): Position => ({ date: d(year) })
const at = (nodeId: string): Position => ({ node: { timelineId: 'u', nodeId } })

// u: two undated nodes with no edge between them (order unknown)
const u: OrderTimeline = { nodes: [{ id: 'x', date: null }, { id: 'y', date: null }], edges: [] }
const ctx: OrderContext = { calendar: cal, timeline: (id) => (id === 'u' ? u : undefined) }

const row = (itemId: string, id: string, atPos: Position, forgottenAt: Position | null = null): EntryLearningRow => ({
  item: { id: itemId, title: `Item ${itemId}` },
  learning: { id, entryId: 'e', at: atPos, forgottenAt },
})

describe('orderLearningRows', () => {
  it('sorts dated learnings by date and lists unplaced order last', () => {
    const rows = [row('a', 'l1', on(1500)), row('b', 'l2', at('x')), row('c', 'l3', on(1000))]
    const out = orderLearningRows(rows, ctx)
    expect(out.map((r) => r.row.learning.id)).toEqual(['l3', 'l1', 'l2'])
    expect(out.map((r) => r.determined)).toEqual([true, true, false])
  })
})

describe('entryKnowledgeAsOf', () => {
  it('gives one state per item, merging its learnings', () => {
    const rows = [row('a', 'l1', on(1000), on(1200)), row('a', 'l2', on(1400)), row('b', 'l3', on(1300))]
    const out = entryKnowledgeAsOf(rows, on(1250), ctx)
    expect(out).toEqual([
      { itemId: 'a', title: 'Item a', state: 'forgotten' },
      { itemId: 'b', title: 'Item b', state: 'not-yet' },
    ])
  })
  it('never guesses unknown order', () => {
    expect(entryKnowledgeAsOf([row('a', 'l1', at('x'))], at('y'), ctx)[0].state).toBe('unknown')
  })
})

describe('chronicleKnowledgeEvents', () => {
  it('makes a learn row and a separate forget row', () => {
    const out = chronicleKnowledgeEvents([row('a', 'l1', on(1000), on(1200)), row('b', 'l2', on(1100))])
    expect(out.map((e) => [e.id, e.kind, e.label])).toEqual([
      ['l1', 'knowledge', 'Item a'],
      ['l1:forgot', 'knowledge-forget', 'Item a'],
      ['l2', 'knowledge', 'Item b'],
    ])
    expect(new Set(out.map((e) => e.rank)).size).toBe(3)
  })
})

describe('forgottenBeforeLearned', () => {
  const check = forgottenBeforeLearned(ctx)
  it('is true when forgetting is before or at the learning', () => {
    expect(check(on(1200), on(1100))).toBe(true)
    expect(check(on(1200), on(1200))).toBe(true)
  })
  it('is false when after or unknown', () => {
    expect(check(on(1100), on(1200))).toBe(false)
    expect(check(at('x'), at('y'))).toBe(false)
  })
})

describe('filterItems', () => {
  const items = [
    { title: 'The crown is cursed', tags: ['royal'], description: 'hidden in the vault' },
    { title: 'Her real name', tags: ['secret'], description: 'Mara' },
  ]
  const text = (d: unknown) => String(d)
  it('matches title, tags and description', () => {
    expect(filterItems(items, 'CROWN', [], text)).toHaveLength(1)
    expect(filterItems(items, 'secre', [], text)).toHaveLength(1)
    expect(filterItems(items, 'vault', [], text)).toHaveLength(1)
  })
  it('needs every picked tag', () => {
    expect(filterItems(items, '', ['royal', 'secret'], text)).toHaveLength(0)
    expect(filterItems(items, '', ['royal'], text)).toHaveLength(1)
  })
})
