import { describe, expect, it } from 'vitest'
import {
  conditionOf,
  firstLineText,
  makeSet,
  makeTerm,
  newTerm,
  retargetSet,
  retargetTerm,
} from './conditionEdit'
import { conditionSchema, setSchema } from '../project/schemas/condition'
import type { Variable } from '../project/schemas/variables'

const flag: Variable = { id: 'f', name: 'Met', type: 'flag', default: false }
const num: Variable = { id: 'n', name: 'Gold', type: 'number', default: 5 }
const txt: Variable = { id: 't', name: 'Name', type: 'text', default: '' }

describe('terms', () => {
  it('new term fits the variable type and the schema', () => {
    for (const v of [flag, num, txt])
      expect(() => conditionSchema.parse({ mode: 'all', terms: [newTerm(v)] })).not.toThrow()
    expect(newTerm(flag)).toEqual({ variableId: 'f', op: 'isTrue' })
    expect(newTerm(num)).toEqual({ variableId: 'n', op: 'eq', value: 0 })
  })
  it('keeps operator and value across variables when they fit', () => {
    const t = retargetTerm(makeTerm(num, 'gt', 3), { ...num, id: 'm' })
    expect(t).toEqual({ variableId: 'm', op: 'gt', value: 3 })
  })
  it('resets to a valid term when the type changes', () => {
    expect(retargetTerm(makeTerm(num, 'gt', 3), flag)).toEqual({ variableId: 'f', op: 'isTrue' })
    expect(retargetTerm(makeTerm(num, 'gt', 3), txt)).toEqual({ variableId: 't', op: 'eq', value: '' })
  })
  it('drops a value of the wrong type', () => {
    expect(makeTerm(num, 'eq', 'x')).toEqual({ variableId: 'n', op: 'eq', value: 0 })
  })
})

describe('sets', () => {
  it('builds valid sets per type', () => {
    for (const s of [makeSet(flag, 'toggle'), makeSet(num, 'add', 2), makeSet(txt, 'set', 'a')])
      expect(() => setSchema.parse(s)).not.toThrow()
    expect(makeSet(num, 'set')).toEqual({ variableId: 'n', op: 'set', value: 5 })
  })
  it('retargeting to another type picks a fitting operator', () => {
    expect(retargetSet(makeSet(num, 'add', 2), flag)).toEqual({ variableId: 'f', op: 'set', value: false })
    expect(retargetSet(makeSet(flag, 'toggle'), txt)).toEqual({ variableId: 't', op: 'set', value: '' })
  })
})

describe('conditionOf', () => {
  it('no terms means no condition', () => {
    expect(conditionOf('any', [])).toBeUndefined()
    expect(conditionOf('any', [newTerm(flag)])).toEqual({ mode: 'any', terms: [newTerm(flag)] })
  })
})

describe('firstLineText', () => {
  const line = (text: string) => ({ type: 'line', content: text ? [{ type: 'text', text }] : [] })
  it('takes the first non-empty line', () => {
    expect(firstLineText({ type: 'doc', content: [line(''), line(' Hi there '), line('x')] })).toBe('Hi there')
  })
  it('is empty without lines', () => {
    expect(firstLineText({ type: 'doc', content: [] })).toBe('')
    expect(firstLineText({})).toBe('')
  })
})
