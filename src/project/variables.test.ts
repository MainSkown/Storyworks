import { describe, expect, it } from 'vitest'
import {
  addVariable,
  emptyVariables,
  removeVariable,
  renameVariable,
  retypeVariable,
  setVariableDefault,
} from './variables'

const ok = <T extends { ok: boolean }>(r: T) => {
  expect(r.ok).toBe(true)
  return (r as unknown as { file: ReturnType<typeof emptyVariables> }).file
}

describe('variable list operations', () => {
  it('adds with the neutral default for the type, trimmed, at the end', () => {
    let f = ok(addVariable(emptyVariables(), { id: '1', name: ' met_king ', type: 'flag' }))
    f = ok(addVariable(f, { id: '2', name: 'gold', type: 'number' }))
    f = ok(addVariable(f, { id: '3', name: 'alias', type: 'text' }))
    expect(f.variables).toEqual([
      { id: '1', name: 'met_king', type: 'flag', default: false },
      { id: '2', name: 'gold', type: 'number', default: 0 },
      { id: '3', name: 'alias', type: 'text', default: '' },
    ])
  })

  it('refuses an empty name and a duplicate name in any case', () => {
    const f = ok(addVariable(emptyVariables(), { id: '1', name: 'Gold', type: 'number' }))
    expect(addVariable(f, { id: '2', name: '  ', type: 'flag' })).toEqual({
      ok: false,
      reason: 'empty-name',
    })
    expect(addVariable(f, { id: '2', name: 'gold', type: 'flag' })).toEqual({
      ok: false,
      reason: 'duplicate-name',
    })
  })

  it('renames, but not to a name another variable has; keeping its own name in other case is fine', () => {
    let f = ok(addVariable(emptyVariables(), { id: '1', name: 'a', type: 'flag' }))
    f = ok(addVariable(f, { id: '2', name: 'b', type: 'flag' }))
    expect(renameVariable(f, '2', 'A')).toEqual({ ok: false, reason: 'duplicate-name' })
    expect(renameVariable(f, '2', ' ')).toEqual({ ok: false, reason: 'empty-name' })
    expect(renameVariable(f, 'zz', 'c')).toEqual({ ok: false, reason: 'unknown-variable' })
    expect(ok(renameVariable(f, '1', 'A')).variables[0].name).toBe('A')
  })

  it('changing the type resets the default; the id stays', () => {
    let f = ok(addVariable(emptyVariables(), { id: '1', name: 'n', type: 'number' }))
    f = ok(setVariableDefault(f, '1', 5))
    f = ok(retypeVariable(f, '1', 'flag'))
    expect(f.variables[0]).toEqual({ id: '1', name: 'n', type: 'flag', default: false })
  })

  it('sets a default only when it matches the type', () => {
    const f = ok(addVariable(emptyVariables(), { id: '1', name: 'n', type: 'number' }))
    expect(ok(setVariableDefault(f, '1', 7)).variables[0].default).toBe(7)
    expect(setVariableDefault(f, '1', 'x')).toEqual({ ok: false, reason: 'bad-default' })
    expect(setVariableDefault(f, '1', NaN)).toEqual({ ok: false, reason: 'bad-default' })
    expect(setVariableDefault(f, 'zz', 1)).toEqual({ ok: false, reason: 'unknown-variable' })
  })

  it('removes by id', () => {
    let f = ok(addVariable(emptyVariables(), { id: '1', name: 'a', type: 'flag' }))
    f = ok(addVariable(f, { id: '2', name: 'b', type: 'flag' }))
    expect(ok(removeVariable(f, '1')).variables.map((v) => v.id)).toEqual(['2'])
    expect(removeVariable(f, 'zz')).toEqual({ ok: false, reason: 'unknown-variable' })
  })

  it('never changes the list it was given', () => {
    const f = ok(addVariable(emptyVariables(), { id: '1', name: 'a', type: 'flag' }))
    const before = JSON.stringify(f)
    renameVariable(f, '1', 'b')
    removeVariable(f, '1')
    expect(JSON.stringify(f)).toBe(before)
  })
})
