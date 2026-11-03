import { describe, expect, it } from 'vitest'
import { parseFile, serialize } from '../serialize'
import { gameOverviewSchema } from './gameOverview'
import { glossarySchema } from './glossary'
import { manifestSchema } from './manifest'
import { mechanicSchema } from './mechanic'
import { mechanicCategorySchema } from './mechanicCategory'

const mech = { version: 1, id: 'm1', title: 'Stamina', categoryId: 'c1' }
const parse = <T>(schema: Parameters<typeof parseFile<T>>[0], value: unknown) =>
  parseFile(schema, JSON.stringify(value), 'game-doc/x.json')

describe('mechanic schema', () => {
  it('a minimal mechanic loads with defaults', () => {
    const r = parse(mechanicSchema, mech)
    expect(r.ok && r.value).toMatchObject({
      summary: '',
      status: 'idea',
      tags: [],
      parameters: [],
      links: [],
      description: { type: 'doc', content: [] },
    })
  })

  it('a full mechanic loads', () => {
    const r = parse(mechanicSchema, {
      ...mech,
      status: 'implemented',
      parameters: [{ id: 'p1', name: 'Max', value: '100' }],
      links: [
        { kind: 'variable', id: 'v1' },
        { kind: 'item', id: 'i1' },
        { kind: 'beat', id: 'b1' },
        { kind: 'entry', id: 'e1' },
        { kind: 'mechanic', id: 'm2' },
      ],
    })
    expect(r.ok).toBe(true)
  })

  it.each([
    ['missing title', { ...mech, title: undefined }],
    ['unknown key', { ...mech, extra: 1 }],
    ['wrong version', { ...mech, version: 2 }],
    ['unknown status', { ...mech, status: 'done' }],
    ['unknown link kind', { ...mech, links: [{ kind: 'rule', id: 'r1' }] }],
    ['duplicate link', { ...mech, links: [{ kind: 'item', id: 'i1' }, { kind: 'item', id: 'i1' }] }],
    [
      'duplicate parameter id',
      { ...mech, parameters: [{ id: 'p', name: 'A', value: '1' }, { id: 'p', name: 'B', value: '2' }] },
    ],
  ])('rejects %s with the file name', (_n, bad) => {
    const r = parse(mechanicSchema, bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.file).toBe('game-doc/x.json')
  })

  it('the same id under two link kinds is allowed', () => {
    const r = parse(mechanicSchema, {
      ...mech,
      links: [{ kind: 'item', id: 'x' }, { kind: 'entry', id: 'x' }],
    })
    expect(r.ok).toBe(true)
  })

  it('writes keys in a stable order', () => {
    const keys = Object.keys(JSON.parse(serialize(mechanicSchema, mechanicSchema.parse(mech))))
    expect(keys).toEqual([
      'version', 'id', 'title', 'summary', 'categoryId', 'status', 'tags', 'description', 'parameters', 'links',
    ])
  })
})

describe('mechanic category schema', () => {
  it('loads, and rejects an unknown key', () => {
    const ok = { version: 1, id: 'c1', name: 'Combat', color: '#aa0000' }
    expect(parse(mechanicCategorySchema, ok).ok).toBe(true)
    expect(parse(mechanicCategorySchema, { ...ok, extra: 1 }).ok).toBe(false)
  })
})

describe('game overview schema', () => {
  it('loads with an empty document by default', () => {
    const r = parse(gameOverviewSchema, { version: 1 })
    expect(r.ok && r.value.content).toEqual({ type: 'doc', content: [] })
  })

  it('rejects an unknown key', () => {
    expect(parse(gameOverviewSchema, { version: 1, extra: 1 }).ok).toBe(false)
  })
})

describe('glossary schema', () => {
  it('loads entries, and an empty list by default', () => {
    expect(parse(glossarySchema, { version: 1 }).ok).toBe(true)
    const r = parse(glossarySchema, { version: 1, entries: [{ id: 'g1', term: 'Gold', definition: 'Money' }] })
    expect(r.ok).toBe(true)
  })

  it('rejects duplicate entry ids and empty terms', () => {
    const e = { id: 'g1', term: 'Gold', definition: '' }
    expect(parse(glossarySchema, { version: 1, entries: [e, { ...e, term: 'Gem' }] }).ok).toBe(false)
    expect(parse(glossarySchema, { version: 1, entries: [{ ...e, term: '  ' }] }).ok).toBe(false)
  })

  it('two entries with the same term are allowed', () => {
    const entries = [
      { id: 'g1', term: 'Gold', definition: 'a' },
      { id: 'g2', term: 'Gold', definition: 'b' },
    ]
    expect(parse(glossarySchema, { version: 1, entries }).ok).toBe(true)
  })
})

describe('manifest game-document keys', () => {
  it('a manifest without them gets empty defaults; a trash entry may be a mechanic', () => {
    const m = manifestSchema.parse({
      version: 18,
      kind: 'game',
      title: 'T',
      author: 'A',
      language: 'en',
      createdAt: '2026-01-01T00:00:00.000Z',
      trash: [
        {
          id: 'm1',
          type: 'mechanic',
          title: 'Stamina',
          originalPath: 'game-doc/mechanics/m1.json',
          trashPath: '.storyworks/trash/m1.json',
          parentId: null,
          index: 0,
          deletedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    expect(m).toMatchObject({ gameOverview: null, glossary: null, mechanics: [], mechanicCategories: [] })
  })
})
