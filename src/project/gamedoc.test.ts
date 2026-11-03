import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MECHANIC_CATEGORIES,
  filterMechanics,
  mechanicCategoryPath,
  mechanicPath,
  reassignMechanics,
  sortGlossary,
} from './gamedoc'
import { deleteCategoryPlan } from './rules'
import { mechanicSchema, type Mechanic } from './schemas/mechanic'

const para = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const mech = (id: string, over: Partial<Mechanic> = {}): Mechanic =>
  mechanicSchema.parse({ version: 1, id, title: id, categoryId: 'c1', ...over })

const mechs = [
  mech('m1', { title: 'Stamina', status: 'implemented', tags: ['core', 'hud'], summary: 'Limits sprinting' }),
  mech('m2', { title: 'Parry', categoryId: 'c2', status: 'designed', tags: ['core'], description: para('Timed block') }),
  mech('m3', { title: 'Shops', categoryId: 'c3', parameters: [{ id: 'p', name: 'Markup', value: '15%' }] }),
]

describe('paths and defaults', () => {
  it('paths', () => {
    expect(mechanicPath('a')).toBe('game-doc/mechanics/a.json')
    expect(mechanicCategoryPath('a')).toBe('game-doc/categories/a.json')
  })
  it('six default categories, in the specified order', () => {
    expect(DEFAULT_MECHANIC_CATEGORIES.map((c) => c.name)).toEqual([
      'Core loop', 'Combat', 'Economy', 'Progression', 'Exploration', 'Interface',
    ])
  })
})

describe('filterMechanics', () => {
  const ids = (f: Parameters<typeof filterMechanics>[1]) => filterMechanics(mechs, f).map((m) => m.id)

  it('no filter keeps manifest order', () => expect(ids({})).toEqual(['m1', 'm2', 'm3']))
  it('by category', () => expect(ids({ categoryId: 'c2' })).toEqual(['m2']))
  it('by status', () => expect(ids({ status: 'implemented' })).toEqual(['m1']))
  it('by tags: all must match', () => {
    expect(ids({ tags: ['core'] })).toEqual(['m1', 'm2'])
    expect(ids({ tags: ['core', 'hud'] })).toEqual(['m1'])
  })
  it('query matches title, summary, tags, description and parameters', () => {
    expect(ids({ query: 'STAMI' })).toEqual(['m1'])
    expect(ids({ query: 'sprinting' })).toEqual(['m1'])
    expect(ids({ query: 'hud' })).toEqual(['m1'])
    expect(ids({ query: 'timed' })).toEqual(['m2'])
    expect(ids({ query: 'markup' })).toEqual(['m3'])
    expect(ids({ query: '15%' })).toEqual(['m3'])
  })
  it('filters combine', () => {
    expect(ids({ categoryId: 'c1', status: 'implemented', tags: ['core'] })).toEqual(['m1'])
    expect(ids({ categoryId: 'c2', status: 'implemented' })).toEqual([])
  })
})

describe('categories', () => {
  it('delete needs a target when mechanics use the category, and never leaves one uncategorised', () => {
    expect(deleteCategoryPlan(['c1', 'c2'], mechs, 'c1').ok).toBe(false)
    const plan = deleteCategoryPlan(['c1', 'c2'], mechs, 'c1', 'c2')
    expect(plan).toEqual({ ok: true, reassign: ['m1'], targetId: 'c2' })
  })
  it('reassignMechanics moves only the matching ones', () => {
    const out = reassignMechanics(mechs, 'c1', 'c2')
    expect(out.map((m) => m.categoryId)).toEqual(['c2', 'c2', 'c3'])
  })
})

describe('sortGlossary', () => {
  const e = (term: string, id = term) => ({ id, term, definition: '' })
  it('sorts A to Z ignoring case', () => {
    expect(sortGlossary([e('zeal'), e('Alpha'), e('beta')], 'en').map((x) => x.term)).toEqual(['Alpha', 'beta', 'zeal'])
  })
  it('puts Polish letters in Polish order', () => {
    const out = sortGlossary([e('Zamek'), e('Łuk'), e('Lis'), e('Żaba')], 'pl').map((x) => x.term)
    expect(out).toEqual(['Lis', 'Łuk', 'Zamek', 'Żaba'])
  })
  it('equal terms keep their file order and the input is not changed', () => {
    const input = [e('Gold', 'b'), e('Gold', 'a')]
    expect(sortGlossary(input, 'en').map((x) => x.id)).toEqual(['b', 'a'])
    expect(input.map((x) => x.id)).toEqual(['b', 'a'])
  })
})
