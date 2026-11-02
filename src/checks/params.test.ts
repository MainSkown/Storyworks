import { describe, expect, it } from 'vitest'
import { gregorianCalendar, type CalendarDate } from '../calendar'
import { EVENT_KIND, type Link } from '../project/links'
import type { OrderContext, Position } from '../timeline/order'
import { dateOrder, invalidNodeDates } from './dates'
import { appearancesAfterFinal, knowledgeTiming, stateOverlaps } from './stateKnowledge'
import {
  brokenLinks,
  coverageFindings,
  duplicateNames,
  entriesWithoutConnections,
  invalidFiles,
  isolatedNodes,
  openTodos,
  unlinkedRules,
} from './structural'

const cal = gregorianCalendar('cal')
const d = (year: number, month = 0, day = 1): CalendarDate => ({ year, month, day })
const on = (date: CalendarDate): Position => ({ date })
const none: OrderContext = { calendar: cal, timeline: () => undefined }

const link: Link = {
  id: 'l1',
  kind: EVENT_KIND,
  from: { item: 's1', block: 'b1' },
  to: { item: 't1', block: 'n1' },
}

describe('structural findings carry variant and params', () => {
  it('broken link: reason variant, owner param for references', () => {
    const [a] = brokenLinks({
      links: [link],
      check: { targetMissing: () => true, passageMissing: () => false },
      passageLabel: () => 'P',
      targetLabel: () => 'N',
    })
    expect(a!.variant).toBe('node-missing')
    const [b] = brokenLinks({
      links: [],
      check: { targetMissing: () => false, passageMissing: () => false },
      passageLabel: () => '',
      targetLabel: () => null,
      refs: [{ ownerKind: 'rule', ownerId: 'r1', ownerLabel: 'Law', targetId: 'x' }],
    })
    expect(b).toMatchObject({ variant: 'ref', params: { owner: 'Law' } })
  })
  it('invalid file: missing, invalid and invalid with detail', () => {
    const f = invalidFiles([
      { kind: 'missing', itemId: 'a', path: 'a.json' },
      { kind: 'invalid', itemId: 'b', path: 'b.json' },
      { kind: 'invalid', itemId: 'c', path: 'c.json', error: { message: 'bad' } },
    ])
    expect(f.map((x) => x.variant)).toEqual(['missing', 'invalid', 'invalid-detail'])
    expect(f[0]!.params).toEqual({ path: 'a.json' })
    expect(f[2]!.params).toEqual({ path: 'c.json', error: 'bad' })
  })
  it('names, titles, counts', () => {
    const [dup] = duplicateNames([
      { id: 'a', typeId: 't', name: 'Ann', aliases: [] },
      { id: 'b', typeId: 't', name: 'ann', aliases: [] },
    ])
    expect(dup!.params).toEqual({ a: 'Ann', b: 'ann', name: 'ann' })
    const [iso] = isolatedNodes([
      {
        id: 't',
        name: 'Main',
        nodes: [
          { id: 'n1', title: 'One' },
          { id: 'n2', title: 'Two' },
        ],
        edges: [],
      },
    ])
    expect(iso!.params).toEqual({ title: 'One', timeline: 'Main' })
    const [rule] = unlinkedRules({ rules: [{ id: 'r', title: 'Law' }], nodes: [], entries: [] })
    expect(rule!.params).toEqual({ title: 'Law' })
    const [entry] = entriesWithoutConnections({
      entries: [{ id: 'e', name: 'Ann', ruleIds: [] }],
      relationships: [],
      groups: [],
      links: [],
      nodes: [],
    })
    expect(entry!.params).toEqual({ name: 'Ann' })
    const cov = coverageFindings({
      nodes: [{ timelineId: 't', id: 'n', title: 'Ev' }],
      scenes: [{ id: 's', title: 'Sc', wordCount: 10 }],
      links: [],
      isBroken: () => false,
    })
    expect(cov.map((f) => f.params)).toEqual([{ title: 'Ev' }, { title: 'Sc' }])
    const [todo] = openTodos([
      { id: 's', title: 'Sc', todos: [{ id: 'a', done: false }, { id: 'b', done: false }] },
    ])
    expect(todo!.params).toEqual({ title: 'Sc', count: '2' })
  })
})

describe('date findings carry variant and params', () => {
  it('invalid date: part variant and title', () => {
    const [f] = invalidNodeDates(cal, [
      { id: 'a', title: 'Dawn', timelineId: 't', date: d(2001, 1, 30) },
    ])
    expect(f).toMatchObject({ variant: 'day', params: { title: 'Dawn' } })
  })
  it('date order: later and earlier titles', () => {
    const [f] = dateOrder(cal, [
      {
        id: 't',
        nodes: [
          { id: 'a', title: 'First', date: d(2000, 5) },
          { id: 'b', title: 'Second', date: d(1999, 5) },
        ],
        edges: [{ id: 'e', from: 'a', to: 'b' }],
      },
    ])
    expect(f!.params).toEqual({ later: 'Second', earlier: 'First' })
  })
})

describe('state and knowledge findings carry variant and params', () => {
  const label = (id: string) => `Entry ${id}`
  const kinds = [{ id: 'loc', name: 'Location', exclusive: true }]
  const state = (id: string, from: Position, until: Position | null, final = false) => ({
    id,
    entryId: 'e1',
    kindId: 'loc',
    value: id.toUpperCase(),
    from,
    until,
    final,
  })
  it('state overlap', () => {
    const [f] = stateOverlaps(
      {
        states: [state('s1', on(d(1)), on(d(10))), state('s2', on(d(5)), on(d(20)))],
        kinds,
        entryLabel: label,
        valueLabel: (s) => s.value,
      },
      none,
    )
    expect(f!.params).toEqual({ entry: 'Entry e1', kind: 'Location', a: 'S1', b: 'S2' })
  })
  it('appearance after final', () => {
    const [f] = appearancesAfterFinal(
      {
        states: [state('s1', on(d(1)), null, true)],
        uses: [{ blockId: 'b', sceneId: 'sc', entryId: 'e1', positions: [on(d(50))], label: 'P' }],
        entryLabel: label,
        valueLabel: (s) => s.value,
      },
      none,
    )
    expect(f!.params).toEqual({ entry: 'Entry e1', state: 'S1' })
  })
  it('knowledge timing: reason variant', () => {
    const use = (blockId: string, p: Position) => ({
      blockId,
      sceneId: 'sc',
      itemId: 'k',
      entryId: 'e1',
      positions: [p],
      label: 'P',
    })
    const learnings = [{ id: 'l', entryId: 'e1', at: on(d(100)), forgottenAt: null }]
    const [before] = knowledgeTiming(
      {
        items: [{ id: 'k', name: 'Secret', learnings }],
        uses: [use('b1', on(d(50)))],
        entryLabel: label,
      },
      none,
    )
    expect(before).toMatchObject({
      variant: 'before-learning',
      params: { entry: 'Entry e1', item: 'Secret' },
    })
    const [never] = knowledgeTiming(
      { items: [{ id: 'k', name: 'Secret', learnings: [] }], uses: [use('b2', on(d(1)))], entryLabel: label },
      none,
    )
    expect(never!.variant).toBe('never-learned')
  })
})

