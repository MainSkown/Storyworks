import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import type { Position } from '../../timeline/order'
import { parseFile } from '../serialize'
import { codexEntrySchema } from './codexEntry'
import { positionSchema } from './position'
import { stateKindSchema } from './stateKind'

const parse = <T>(schema: z.ZodType<T>, v: unknown) =>
  parseFile(schema, JSON.stringify(v), 'x.json')

describe('position schema', () => {
  it('its type is the order helper Position', () => {
    const p: z.infer<typeof positionSchema> = { date: { year: 1, month: 0, day: 1 } }
    const same: Position = p
    const back: z.infer<typeof positionSchema> = same
    expect(back).toEqual(p)
  })
  it.each([
    ['node', { node: { timelineId: 't', nodeId: 'n' } }],
    ['date', { date: { year: 1, month: 0, day: 1 } }],
  ])('accepts a %s position', (_n, v) => {
    expect(parse(positionSchema, v).ok).toBe(true)
  })
  it.each([
    ['both keys', { node: { timelineId: 't', nodeId: 'n' }, date: { year: 1, month: 0, day: 1 } }],
    ['empty', {}],
    ['extra key in node', { node: { timelineId: 't', nodeId: 'n', x: 1 } }],
    ['fractional day', { date: { year: 1, month: 0, day: 1.5 } }],
  ])('rejects %s', (_n, v) => {
    expect(parse(positionSchema, v).ok).toBe(false)
  })
})

describe('state kind schema', () => {
  const k = { version: 1, id: 'k1', name: 'Location', valueType: 'entry', exclusive: true }
  it('a valid kind loads', () => {
    expect(parse(stateKindSchema, k).ok).toBe(true)
  })
  it.each([
    ['unknown value type', { ...k, valueType: 'number' }],
    ['missing exclusive', { ...k, exclusive: undefined }],
    ['unknown key', { ...k, extra: 1 }],
    ['wrong version', { ...k, version: 2 }],
  ])('rejects %s with the file name', (_n, bad) => {
    const r = parse(stateKindSchema, bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.file).toBe('x.json')
  })
})

describe('entry states (entry v2)', () => {
  const entry = { version: 2, id: 'e1', typeId: 't1', name: 'Anna' }
  const date = { year: 1, month: 0, day: 1 }
  const state = { id: 's1', kindId: 'k1', value: 'Paris', from: { date } }

  it('states default to empty; until to null; final to false', () => {
    const r = parse(codexEntrySchema, { ...entry, states: [state] })
    expect(r.ok && r.value.states).toEqual([{ ...state, until: null, final: false }])
    const bare = parse(codexEntrySchema, entry)
    expect(bare.ok && bare.value.states).toEqual([])
  })
  it('a version 1 entry is rejected', () => {
    expect(parse(codexEntrySchema, { ...entry, version: 1 }).ok).toBe(false)
  })
  it.each([
    ['duplicate state ids', { states: [state, state] }],
    ['missing from', { states: [{ ...state, from: undefined }] }],
    ['unknown key in a state', { states: [{ ...state, extra: 1 }] }],
    ['non-string value', { states: [{ ...state, value: 5 }] }],
  ])('rejects %s', (_n, bad) => {
    expect(parse(codexEntrySchema, { ...entry, ...bad }).ok).toBe(false)
  })
})
