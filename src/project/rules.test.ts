import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import {
  brokenRuleLinks,
  deleteCategoryPlan,
  filterRules,
  reassignRules,
  ruleCategoryPath,
  rulePath,
  seedRuleCategories,
  usedIn,
} from './rules'
import { ruleCategorySchema } from './schemas/ruleCategory'
import { ruleSchema, type Rule } from './schemas/rule'
import { parseFile } from './serialize'
import { timelineSchema } from '../timeline/schema'
import type { Env } from './types'

const makeEnv = (): Env => {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const para = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const rule = (id: string, over: Partial<Rule> = {}): Rule =>
  ruleSchema.parse({ version: 1, id, title: id, categoryId: 'c1', ...over })

const rules = [
  rule('r1', { title: 'Mana is finite', categoryId: 'c1', tags: ['cost', 'core'], description: para('Every spell drains the caster') }),
  rule('r2', { title: 'Gravity', categoryId: 'c2', tags: ['core'], exceptions: para('Except in the Void') }),
  rule('r3', { title: 'Guilds', categoryId: 'c3', tags: [] }),
]

describe('filterRules', () => {
  const ids = (f: Parameters<typeof filterRules>[1]) => filterRules(rules, f).map((r) => r.id)

  it('no filter returns everything in order', () => expect(ids({})).toEqual(['r1', 'r2', 'r3']))
  it('by category', () => expect(ids({ categoryId: 'c2' })).toEqual(['r2']))
  it('by tag; several tags must all match', () => {
    expect(ids({ tags: ['core'] })).toEqual(['r1', 'r2'])
    expect(ids({ tags: ['core', 'cost'] })).toEqual(['r1'])
  })
  it('query matches title, case-insensitive', () => expect(ids({ query: 'GRAV' })).toEqual(['r2']))
  it('query matches tags', () => expect(ids({ query: 'cost' })).toEqual(['r1']))
  it('query matches description and exceptions text', () => {
    expect(ids({ query: 'drains' })).toEqual(['r1'])
    expect(ids({ query: 'the void' })).toEqual(['r2'])
  })
  it('combined filters narrow', () => {
    expect(ids({ categoryId: 'c1', tags: ['core'], query: 'mana' })).toEqual(['r1'])
    expect(ids({ categoryId: 'c2', query: 'mana' })).toEqual([])
  })
  it('blank query is ignored', () => expect(ids({ query: '   ' })).toHaveLength(3))
})

describe('deleteCategoryPlan', () => {
  const cats = ['c1', 'c2', 'c3']

  it('an empty category deletes without a target', () => {
    expect(deleteCategoryPlan(cats, rules, 'c4')).toEqual({ ok: false, reason: 'unknown-category' })
    expect(deleteCategoryPlan(cats, [], 'c3')).toEqual({ ok: true, reassign: [], targetId: null })
  })
  it('refused without a target when it has rules', () => {
    expect(deleteCategoryPlan(cats, rules, 'c1')).toEqual({ ok: false, reason: 'target-required' })
  })
  it('refused when the target is the category itself or unknown', () => {
    expect(deleteCategoryPlan(cats, rules, 'c1', 'c1')).toEqual({ ok: false, reason: 'bad-target' })
    expect(deleteCategoryPlan(cats, rules, 'c1', 'zz')).toEqual({ ok: false, reason: 'bad-target' })
  })
  it('with a target lists the rules to move', () => {
    expect(deleteCategoryPlan(cats, rules, 'c1', 'c2')).toEqual({ ok: true, reassign: ['r1'], targetId: 'c2' })
  })
  it('the last category cannot be deleted', () => {
    expect(deleteCategoryPlan(['c1'], [], 'c1')).toEqual({ ok: false, reason: 'last-category' })
  })
})

describe('reassignRules', () => {
  it('moves only that category and keeps the rest', () => {
    const out = reassignRules(rules, 'c1', 'c2')
    expect(out.map((r) => r.categoryId)).toEqual(['c2', 'c2', 'c3'])
    expect(rules[0].categoryId).toBe('c1')
  })
})

describe('usedIn and broken links', () => {
  const tl = (id: string, nodes: [string, string[]][]) =>
    timelineSchema.parse({
      version: 1,
      id,
      name: `TL ${id}`,
      nodes: nodes.map(([nid, ruleIds]) => ({ id: nid, title: `N ${nid}`, ruleIds })),
    })
  const timelines = [tl('t1', [['a', ['r1']], ['b', []]]), tl('t2', [['c', ['r1', 'gone']]])]

  it('lists nodes that use the rule, across timelines', () => {
    expect(usedIn(timelines, 'r1')).toEqual([
      { timelineId: 't1', timelineName: 'TL t1', nodeId: 'a', nodeTitle: 'N a' },
      { timelineId: 't2', timelineName: 'TL t2', nodeId: 'c', nodeTitle: 'N c' },
    ])
    expect(usedIn(timelines, 'r9')).toEqual([])
  })

  it('a missing or trashed rule shows as a broken id', () => {
    expect(brokenRuleLinks(timelines, new Set(['r1']))).toEqual([
      { timelineId: 't2', nodeId: 'c', ruleId: 'gone' },
    ])
    expect(brokenRuleLinks(timelines, new Set())).toHaveLength(3)
  })
})

describe('seedRuleCategories', () => {
  async function book(forceReadOnly = false) {
    const io = createMemoryProjectIO()
    const env = makeEnv()
    await createProject(io, { title: 'B', author: 'A', language: 'en' }, env)
    const r = await openProject(io, env, forceReadOnly ? { forceReadOnly: 'locked-elsewhere' } : {})
    if (r.status !== 'ok') throw new Error('open failed')
    return { io, env, project: r.project }
  }

  it('an empty book gets the five default categories, valid on disk', async () => {
    const { io, env, project } = await book()
    await seedRuleCategories(project, env)
    expect(project.manifest.ruleCategories).toHaveLength(5)
    const names = project.manifest.ruleCategories.map((r) => {
      const res = parseFile(ruleCategorySchema, io.files.get(r.path) as string, r.path)
      return res.ok ? res.value.name : null
    })
    expect(names).toEqual(['Magic', 'Physics', 'Society', 'Technology', 'Religion'])
    expect(JSON.parse(io.files.get('project.json') as string).ruleCategories).toHaveLength(5)
  })

  it('is idempotent', async () => {
    const { io, env, project } = await book()
    await seedRuleCategories(project, env)
    const snap = new Map(io.files)
    await seedRuleCategories(project, env)
    expect(io.files).toEqual(snap)
  })

  it('leaves existing categories alone', async () => {
    const { env, project } = await book()
    project.manifest.ruleCategories = [{ id: 'cx', path: ruleCategoryPath('cx'), title: 'Mine' }]
    await seedRuleCategories(project, env)
    expect(project.manifest.ruleCategories.map((r) => r.id)).toEqual(['cx'])
  })

  it('does not come back when rules exist but categories were deleted', async () => {
    const { env, project } = await book()
    project.manifest.rules = [{ id: 'r1', path: rulePath('r1'), title: 'R' }]
    await seedRuleCategories(project, env)
    expect(project.manifest.ruleCategories).toEqual([])
  })

  it('read-only: nothing is created', async () => {
    const { io, env, project } = await book(true)
    const before = new Map(io.files)
    await seedRuleCategories(project, env)
    expect(io.files).toEqual(before)
  })
})
