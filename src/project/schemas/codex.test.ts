import { describe, expect, it } from 'vitest'
import { parseFile, serialize } from '../serialize'
import { codexEntrySchema } from './codexEntry'
import { codexTypeSchema } from './codexType'

const entry = { version: 1, id: 'e1', typeId: 't1', name: 'Anna' }

describe('codex entry schema', () => {
  it('a minimal entry loads with defaults', () => {
    const r = parseFile(codexEntrySchema, JSON.stringify(entry), 'codex/e1.json')
    expect(r.ok && r.value).toMatchObject({
      aliases: [],
      image: null,
      tags: [],
      ruleIds: [],
      appendixText: '',
      includeInAppendices: false,
      notes: { type: 'doc', content: [] },
    })
  })

  it.each([
    ['missing name', { ...entry, name: undefined }],
    ['missing type', { ...entry, typeId: undefined }],
    ['unknown key', { ...entry, extra: 1 }],
    ['wrong version', { ...entry, version: 2 }],
    ['aliases not strings', { ...entry, aliases: [1] }],
    ['duplicate aliases', { ...entry, aliases: ['Ann', 'Ann'] }],
    ['duplicate aliases ignoring case and spaces', { ...entry, aliases: ['Ann', ' ann '] }],
    ['absolute image path', { ...entry, image: '/home/me/pic.png' }],
    ['image outside assets', { ...entry, image: 'assets/../secret.png' }],
    ['image not under assets', { ...entry, image: 'pics/a.png' }],
  ])('rejects %s with the file name', (_n, bad) => {
    const r = parseFile(codexEntrySchema, JSON.stringify(bad), 'codex/e1.json')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.file).toBe('codex/e1.json')
  })

  it('accepts an assets image and distinct aliases', () => {
    const r = codexEntrySchema.safeParse({ ...entry, image: 'assets/a.png', aliases: ['Ann', 'Annie'] })
    expect(r.success).toBe(true)
  })

  it('writes keys in a stable order', () => {
    const keys = Object.keys(JSON.parse(serialize(codexEntrySchema, codexEntrySchema.parse(entry))))
    expect(keys).toEqual([
      'version', 'id', 'typeId', 'name', 'aliases', 'image', 'notes', 'tags', 'ruleIds',
      'appendixText', 'includeInAppendices',
    ])
  })
})

describe('codex type schema', () => {
  const type = { version: 1, id: 't1', name: 'Character', color: '#7e3f8f', icon: 'person' }

  it('valid loads, key order is stable', () => {
    const v = codexTypeSchema.parse(type)
    expect(Object.keys(JSON.parse(serialize(codexTypeSchema, v)))).toEqual([
      'version', 'id', 'name', 'color', 'icon',
    ])
  })

  it.each([
    ['missing name', { ...type, name: undefined }],
    ['missing icon', { ...type, icon: undefined }],
    ['unknown key', { ...type, extra: 1 }],
  ])('rejects %s', (_n, bad) => {
    expect(parseFile(codexTypeSchema, JSON.stringify(bad), 't').ok).toBe(false)
  })
})
