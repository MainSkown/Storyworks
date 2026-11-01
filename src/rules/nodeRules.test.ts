import { describe, expect, it } from 'vitest'
import { addRuleId, groupPickerRules, resolveNodeRules } from './nodeRules'

const cats = [
  { id: 'c1', name: 'Magic' },
  { id: 'c2', name: 'Physics' },
]
const rules = [
  { id: 'a', title: 'Mana', categoryId: 'c1', tags: ['power'] },
  { id: 'b', title: 'Gravity', categoryId: 'c2', tags: [] },
  { id: 'c', title: 'Spells', categoryId: 'c1', tags: [] },
]

describe('resolveNodeRules', () => {
  it('keeps node order and marks unknown ids as missing', () => {
    const r = resolveNodeRules(['b', 'x', 'a'], rules, cats)
    expect(r.map((x) => (x.missing ? `!${x.id}` : x.rule.id))).toEqual(['b', '!x', 'a'])
    expect(r[0]).toMatchObject({ categoryName: 'Physics' })
  })
  it('keeps a rule whose category is gone', () => {
    const r = resolveNodeRules(['a'], [{ ...rules[0], categoryId: 'zz' }], cats)
    expect(r[0]).toMatchObject({ missing: false, categoryName: null })
  })
})

describe('addRuleId', () => {
  it('appends once', () => {
    expect(addRuleId(['a'], 'b')).toEqual(['a', 'b'])
    expect(addRuleId(['a'], 'a')).toEqual(['a'])
  })
})

describe('groupPickerRules', () => {
  it('groups by category, skipping linked rules and empty groups', () => {
    const g = groupPickerRules(rules, cats, '', ['a'])
    expect(g.map((x) => [x.name, x.rules.map((r) => r.id)])).toEqual([
      ['Magic', ['c']],
      ['Physics', ['b']],
    ])
  })
  it('filters by title, tag and category name', () => {
    expect(groupPickerRules(rules, cats, 'mana', []).flatMap((x) => x.rules.map((r) => r.id))).toEqual(['a'])
    expect(groupPickerRules(rules, cats, 'POWER', []).flatMap((x) => x.rules.map((r) => r.id))).toEqual(['a'])
    expect(groupPickerRules(rules, cats, 'physics', []).flatMap((x) => x.rules.map((r) => r.id))).toEqual(['b'])
    expect(groupPickerRules(rules, cats, 'nothing', [])).toEqual([])
  })
})
