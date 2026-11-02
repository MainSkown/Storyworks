import { describe, expect, it } from 'vitest'
import {
  brokenAbout,
  brokenLearnings,
  knowledgeEventCountAtNode,
  knowledgePath,
  learningsAtNode,
  learningsOfEntry,
  learningsOfItem,
  validateLearning,
} from './knowledge'
import type { KnowledgeItem, Learning } from './schemas/knowledge'

const node = (nodeId: string, timelineId = 't') => ({ node: { timelineId, nodeId } })
const date = (year: number) => ({ date: { year, month: 0, day: 1 } })
const learning = (id: string, entryId: string, extra: Partial<Learning> = {}): Learning => ({
  id,
  entryId,
  at: date(1),
  note: '',
  forgottenAt: null,
  revealedIn: null,
  ...extra,
})
const item = (
  id: string,
  learnings: Learning[],
  about: KnowledgeItem['about'] = null,
): KnowledgeItem => ({
  version: 1,
  id,
  title: id,
  description: { type: 'doc', content: [] },
  tags: [],
  about,
  learnings,
})

describe('knowledgePath', () => {
  it('is knowledge/<id>.json', () => {
    expect(knowledgePath('k1')).toBe('knowledge/k1.json')
  })
})

describe('validateLearning', () => {
  const live = { entryIds: new Set(['e1']) }
  const before = () => true
  const unknown = () => false
  it('accepts a live entry with no forgetting', () => {
    expect(validateLearning(learning('l', 'e1'), live)).toEqual({ ok: true })
  })
  it('rejects an entry that is not live', () => {
    expect(validateLearning(learning('l', 'zz'), live)).toEqual({
      ok: false,
      reason: 'unknown-entry',
    })
  })
  it('rejects forgetting definitely before learning', () => {
    const l = learning('l', 'e1', { forgottenAt: date(0) })
    expect(validateLearning(l, live, before)).toEqual({
      ok: false,
      reason: 'forgotten-before-learned',
    })
  })
  it('accepts forgetting with unknown order', () => {
    const l = learning('l', 'e1', { forgottenAt: node('n') })
    expect(validateLearning(l, live, unknown)).toEqual({ ok: true })
  })
  it('does not ask the order function when nothing is forgotten', () => {
    let called = false
    validateLearning(learning('l', 'e1'), live, () => (called = true))
    expect(called).toBe(false)
  })
})

describe('broken ones', () => {
  const items = [
    item('k1', [learning('a', 'e1'), learning('b', 'gone')], { type: 'entry', id: 'gone' }),
    item('k2', [learning('c', 'e1')], { type: 'rule', id: 'r1' }),
    item('k3', [], { type: 'rule', id: 'r-gone' }),
    item('k4', []),
  ]
  it('learner entry not live', () => {
    expect(brokenLearnings(items, new Set(['e1']))).toEqual([{ itemId: 'k1', learningId: 'b' }])
    expect(brokenLearnings(items, new Set(['e1', 'gone']))).toEqual([])
  })
  it('about target not live', () => {
    expect(brokenAbout(items, new Set(['e1']), new Set(['r1']))).toEqual(['k1', 'k3'])
    expect(brokenAbout(items, new Set(['gone']), new Set(['r1', 'r-gone']))).toEqual([])
  })
})

describe('lookups', () => {
  const items = [
    item('k1', [learning('a', 'e1', { at: node('n1'), forgottenAt: node('n2') })]),
    item('k2', [
      learning('b', 'e2', { at: node('n2') }),
      learning('c', 'e1', { at: node('n2', 'other') }),
    ]),
  ]
  it('learningsOfEntry follows manifest order', () => {
    expect(learningsOfEntry(items, 'e1').map((r) => [r.item.id, r.learning.id])).toEqual([
      ['k1', 'a'],
      ['k2', 'c'],
    ])
  })
  it('learningsOfItem lists its learnings', () => {
    expect(learningsOfItem(items[1]).map((l) => l.id)).toEqual(['b', 'c'])
  })
  it('learningsAtNode lists learn and forget events of that timeline node', () => {
    expect(
      learningsAtNode(items, 't', 'n2').map((r) => [r.item.id, r.learning.id, r.kind]),
    ).toEqual([
      ['k1', 'a', 'forgets'],
      ['k2', 'b', 'learns'],
    ])
  })
  it('a learn and forget at the same node count twice; dates and other nodes do not count', () => {
    const both = [item('k', [learning('a', 'e1', { at: node('n'), forgottenAt: node('n') })])]
    expect(knowledgeEventCountAtNode(both, 't', 'n')).toBe(2)
    expect(knowledgeEventCountAtNode(items, 't', 'n1')).toBe(1)
    expect(knowledgeEventCountAtNode(items, 't', 'none')).toBe(0)
    expect(knowledgeEventCountAtNode([item('d', [learning('a', 'e1')])], 't', 'n')).toBe(0)
  })
})
