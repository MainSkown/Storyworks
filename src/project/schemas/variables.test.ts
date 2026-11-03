import { describe, expect, it } from 'vitest'
import { variablesSchema, VARIABLES_VERSION, defaultFor } from './variables'

const file = (variables: unknown[]) => ({ version: VARIABLES_VERSION, variables })
const v = (id: string, name: string, type: string, def: unknown) => ({ id, name, type, default: def })

describe('variables schema', () => {
  it('loads flags, numbers and text', () => {
    const r = variablesSchema.safeParse(
      file([v('1', 'met_king', 'flag', false), v('2', 'gold', 'number', 10), v('3', 'alias', 'text', '')]),
    )
    expect(r.success).toBe(true)
  })

  it('an empty list is valid', () => {
    expect(variablesSchema.safeParse(file([])).success).toBe(true)
  })

  it('rejects a default that does not match the type', () => {
    expect(variablesSchema.safeParse(file([v('1', 'a', 'flag', 1)])).success).toBe(false)
    expect(variablesSchema.safeParse(file([v('1', 'a', 'number', '3')])).success).toBe(false)
    expect(variablesSchema.safeParse(file([v('1', 'a', 'text', false)])).success).toBe(false)
  })

  it('rejects a non-finite number default', () => {
    expect(variablesSchema.safeParse(file([v('1', 'a', 'number', Infinity)])).success).toBe(false)
    expect(variablesSchema.safeParse(file([v('1', 'a', 'number', NaN)])).success).toBe(false)
  })

  it('rejects an unknown type, an empty or blank name', () => {
    expect(variablesSchema.safeParse(file([v('1', 'a', 'item', 'x')])).success).toBe(false)
    expect(variablesSchema.safeParse(file([v('1', '', 'flag', false)])).success).toBe(false)
    expect(variablesSchema.safeParse(file([v('1', '  ', 'flag', false)])).success).toBe(false)
  })

  it('rejects duplicate names ignoring case, and duplicate ids', () => {
    expect(variablesSchema.safeParse(file([v('1', 'Gold', 'number', 0), v('2', 'gold', 'number', 0)])).success).toBe(false)
    expect(variablesSchema.safeParse(file([v('1', 'a', 'flag', false), v('1', 'b', 'flag', false)])).success).toBe(false)
  })

  it('rejects unknown fields and a wrong version', () => {
    expect(variablesSchema.safeParse({ ...file([]), extra: 1 }).success).toBe(false)
    expect(variablesSchema.safeParse({ version: 9, variables: [] }).success).toBe(false)
  })

  it('defaultFor gives the neutral default per type', () => {
    expect(defaultFor('flag')).toBe(false)
    expect(defaultFor('number')).toBe(0)
    expect(defaultFor('text')).toBe('')
  })
})
