import { describe, expect, it } from 'vitest'
import { parseFile, serialize } from '../serialize'
import { ruleSchema } from './rule'
import { ruleCategorySchema } from './ruleCategory'

const rule = { version: 1, id: 'r1', title: 'No teleport', categoryId: 'c1' }

describe('rule schema', () => {
  it('a minimal rule loads with defaults', () => {
    const r = parseFile(ruleSchema, JSON.stringify(rule), 'rules/r1.json')
    expect(r.ok && r.value).toMatchObject({ tags: [], description: { type: 'doc', content: [] } })
    expect(r.ok && r.value.exceptions).toEqual({ type: 'doc', content: [] })
  })

  it.each([
    ['missing title', { ...rule, title: undefined }],
    ['unknown key', { ...rule, extra: 1 }],
    ['wrong version', { ...rule, version: 2 }],
    ['tags not strings', { ...rule, tags: [1] }],
  ])('rejects %s with the file name', (_n, bad) => {
    const r = parseFile(ruleSchema, JSON.stringify(bad), 'rules/r1.json')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.file).toBe('rules/r1.json')
  })

  it('writes keys in a stable order', () => {
    const parsed = ruleSchema.parse({ ...rule, tags: ['x'] })
    const keys = Object.keys(JSON.parse(serialize(ruleSchema, parsed)))
    expect(keys).toEqual(['version', 'id', 'title', 'categoryId', 'description', 'tags', 'exceptions'])
  })
})

describe('rule category schema', () => {
  const cat = { version: 1, id: 'c1', name: 'Magic', color: '#8b5cf6' }

  it('valid loads, key order is stable', () => {
    const v = ruleCategorySchema.parse(cat)
    expect(Object.keys(JSON.parse(serialize(ruleCategorySchema, v)))).toEqual([
      'version',
      'id',
      'name',
      'color',
    ])
  })

  it('rejects a missing name', () => {
    expect(parseFile(ruleCategorySchema, JSON.stringify({ ...cat, name: undefined }), 'c').ok).toBe(
      false,
    )
  })
})
