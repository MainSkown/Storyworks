import { describe, expect, it } from 'vitest'
import { gregorianCalendar } from '../calendar'
import { EVENT_KIND, type Link } from '../project/links'
import { runChecks, type CheckData, type CheckTimeline } from './run'
import { CHECK_IDS, type CheckId } from './types'

const calendar = gregorianCalendar('cal')
const all = () => true

function emptyData(): CheckData {
  return {
    calendar,
    order: { calendar, timeline: () => undefined },
    timelines: [],
    scenes: [],
    links: [],
    linkCheck: { targetMissing: () => false, passageMissing: () => false, isBroken: () => false },
    passageLabel: () => 'Passage',
    targetLabel: () => null,
    brokenRefs: [],
    rules: [],
    entries: [],
    relationships: [],
    groups: [],
    knowledgeItems: [],
    stateKinds: [],
    states: [],
    uses: [],
    knowledgeUses: [],
    entryLabel: (id) => id,
    valueLabel: (s) => s.value,
    otherLinkedIds: [],
    otherRuleLinkedIds: [],
    problems: [],
  }
}

const node = (id: string, date: { year: number; month: number; day: number } | null = null) => ({
  id,
  title: `Node ${id}`,
  date,
  ruleIds: [],
  codexIds: [],
})
const timeline = (id: string, nodes: CheckTimeline['nodes'], pairs: [string, string][] = []): CheckTimeline => ({
  id,
  name: `TL ${id}`,
  nodes,
  edges: pairs.map(([from, to], i) => ({ id: `e${i}`, from, to })),
})
const link = (id: string): Link => ({
  id,
  kind: EVENT_KIND,
  from: { item: 's1', block: 'b1' },
  to: { item: 't1', block: 'a' },
})
const entry = (id: string, name = id, typeId = 'ty') => ({
  id,
  typeId,
  name,
  aliases: [],
  ruleIds: [],
})

/** One bad case for each checker group. */
function badData(): CheckData {
  const d = emptyData()
  const t = timeline('t1', [node('a', { year: 2000, month: 5, day: 1 }), node('b', { year: 1999, month: 0, day: 1 }), node('lonely')], [['a', 'b']])
  d.timelines = [t]
  d.order = { calendar, timeline: (id) => (id === 't1' ? t : undefined) }
  d.links = [link('l1')]
  d.linkCheck = { targetMissing: () => true, passageMissing: () => false, isBroken: () => true }
  d.scenes = [{ id: 's1', title: 'Scene', wordCount: 10, todos: [{ id: 'td', done: false }] }]
  d.rules = [{ id: 'r1', title: 'Rule' }]
  d.entries = [entry('e1', 'Anna'), entry('e2', 'anna')]
  d.problems = [{ kind: 'missing', itemId: 'x', path: 'x.json' }]
  return d
}

describe('runChecks', () => {
  it('gives no findings for an empty book', () => {
    expect(runChecks(emptyData(), all)).toEqual([])
  })

  it('runs only enabled checks', () => {
    const d = badData()
    expect(runChecks(d, () => false)).toEqual([])
    const only = runChecks(d, (id) => id === 'invalid-file')
    expect(only.map((f) => f.checkId)).toEqual(['invalid-file'])
  })

  it('finds a bad case in each checker group', () => {
    const ids = new Set(runChecks(badData(), all).map((f) => f.checkId))
    const expected: CheckId[] = [
      'broken-link',
      'invalid-file',
      'date-order',
      'duplicate-name',
      'node-no-passage',
      'isolated-node',
      'unlinked-rule',
      'open-todo',
      'entry-no-connections',
    ]
    for (const id of expected) expect(ids, id).toContain(id)
  })

  it('finds an invalid date', () => {
    const d = emptyData()
    d.timelines = [timeline('t1', [node('a', { year: 2000, month: 20, day: 1 })])]
    expect(runChecks(d, all).map((f) => f.checkId)).toContain('invalid-date')
  })

  it('finds state and knowledge problems', () => {
    const d = emptyData()
    const t = timeline('t1', [node('a'), node('b'), node('c')], [['a', 'b'], ['b', 'c']])
    d.timelines = [t]
    d.order = { calendar, timeline: () => t }
    const at = (nodeId: string) => ({ node: { timelineId: 't1', nodeId } })
    d.stateKinds = [{ id: 'k', name: 'Place', exclusive: true }]
    d.states = [
      { id: 's1', entryId: 'e1', kindId: 'k', value: 'A', from: at('a'), until: at('c'), final: false },
      { id: 's2', entryId: 'e1', kindId: 'k', value: 'B', from: at('b'), until: null, final: true },
    ]
    d.uses = [{ blockId: 'b1', sceneId: 's1', entryId: 'e1', positions: [at('c')], label: 'Text' }]
    d.knowledgeItems = [{ id: 'k1', name: 'Secret', learnings: [{ id: 'l', entryId: 'e1', at: at('c'), forgottenAt: null }] }]
    d.knowledgeUses = [{ blockId: 'b2', sceneId: 's1', entryId: 'e1', itemId: 'k1', positions: [at('a')], label: 'Text' }]
    const ids = runChecks(d, all).map((f) => f.checkId)
    expect(ids).toContain('state-overlap')
    expect(ids).toContain('appearance-after-final')
    expect(ids).toContain('knowledge-timing')
  })

  it('sorts errors before warnings before info', () => {
    const order = runChecks(badData(), all).map((f) => f.severity)
    const rank = { error: 0, warning: 1, info: 2 }
    expect(order).toEqual([...order].sort((a, b) => rank[a] - rank[b]))
    expect(new Set(order)).toEqual(new Set(['error', 'warning', 'info']))
  })

  it('gives the same ids for the same data and no duplicates', () => {
    const a = runChecks(badData(), all).map((f) => f.id)
    const b = runChecks(badData(), all).map((f) => f.id)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
  })

  it('gives a changed problem a new id', () => {
    const d = badData()
    const before = runChecks(d, all).find((f) => f.checkId === 'open-todo')!.id
    d.scenes[0]!.todos.push({ id: 'td2', done: false })
    const after = runChecks(d, all).find((f) => f.checkId === 'open-todo')!.id
    expect(after).not.toBe(before)
  })

  it('has a checker for every check id', () => {
    for (const id of CHECK_IDS) expect(() => runChecks(emptyData(), (x) => x === id)).not.toThrow()
  })
})
