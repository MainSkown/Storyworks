import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { parseFile } from '../serialize'
import { groupSchema } from './group'
import { relationLayoutSchema } from './relationLayout'
import { relationTypeSchema } from './relationType'
import { relationshipSchema } from './relationship'

const parse = <T>(schema: z.ZodType<T>, v: unknown) => parseFile(schema, JSON.stringify(v), 'x.json')

describe('relation type schema', () => {
  const t = { version: 1, id: 't1', name: 'Friend', color: '#fff' }

  it('reverseLabel defaults to empty', () => {
    const r = parse(relationTypeSchema, t)
    expect(r.ok && r.value).toMatchObject({ reverseLabel: '' })
  })
  it.each([
    ['missing name', { ...t, name: undefined }],
    ['unknown key', { ...t, extra: 1 }],
    ['wrong version', { ...t, version: 2 }],
  ])('rejects %s with the file name', (_n, bad) => {
    const r = parse(relationTypeSchema, bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.file).toBe('x.json')
  })
})

describe('relationship schema', () => {
  const rel = { version: 1, id: 'r1', fromId: 'a', toId: 'b', typeId: 't1' }

  it('a minimal relationship loads with defaults', () => {
    const r = parse(relationshipSchema, rel)
    expect(r.ok && r.value).toMatchObject({ note: { type: 'doc', content: [] }, nodeRef: null })
  })
  it('accepts a node reference', () => {
    const nodeRef = { timelineId: 'tl', nodeId: 'n' }
    expect(parse(relationshipSchema, { ...rel, nodeRef }).ok).toBe(true)
  })
  it.each([
    ['self relationship', { ...rel, toId: 'a' }],
    ['missing type', { ...rel, typeId: undefined }],
    ['unknown key', { ...rel, extra: 1 }],
    ['incomplete node ref', { ...rel, nodeRef: { timelineId: 'tl' } }],
    ['wrong version', { ...rel, version: 2 }],
  ])('rejects %s', (_n, bad) => {
    expect(parse(relationshipSchema, bad).ok).toBe(false)
  })
})

describe('group schema', () => {
  const g = { version: 1, id: 'g1', name: 'House', color: '#000', memberIds: ['a', 'b'] }

  it('valid group loads; members default to none', () => {
    expect(parse(groupSchema, g).ok).toBe(true)
    const r = parse(groupSchema, { ...g, memberIds: undefined })
    expect(r.ok && r.value.memberIds).toEqual([])
  })
  it('rejects duplicate members', () => {
    expect(parse(groupSchema, { ...g, memberIds: ['a', 'a'] }).ok).toBe(false)
  })
  it('rejects unknown keys', () => {
    expect(parse(groupSchema, { ...g, extra: 1 }).ok).toBe(false)
  })
})

describe('relation layout schema', () => {
  it('loads positions; empty by default', () => {
    expect(parse(relationLayoutSchema, { version: 1, positions: { a: { x: 1, y: 2 } } }).ok).toBe(true)
    const r = parse(relationLayoutSchema, { version: 1 })
    expect(r.ok && r.value.positions).toEqual({})
  })
  it('rejects a position without y', () => {
    expect(parse(relationLayoutSchema, { version: 1, positions: { a: { x: 1 } } }).ok).toBe(false)
  })
})
