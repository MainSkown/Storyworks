import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import {
  brokenCodexLinks,
  codexTypePath,
  deleteTypePlan,
  entriesUsingRule,
  filterEntries,
  nodesUsingEntry,
  reassignEntries,
  seedCodexTypes,
} from './codex'
import { codexEntrySchema, type CodexEntry } from './schemas/codexEntry'
import { codexTypeSchema } from './schemas/codexType'
import { parseFile } from './serialize'
import { timelineSchema } from '../timeline/schema'
import type { Env } from './types'

const makeEnv = (): Env => {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const para = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const entry = (id: string, over: Partial<CodexEntry> = {}): CodexEntry =>
  codexEntrySchema.parse({ version: 1, id, typeId: 't1', name: id, ...over })

const entries = [
  entry('e1', { name: 'Anna', aliases: ['Annie'], tags: ['hero'], notes: para('Born in the north') }),
  entry('e2', { name: 'Sword', typeId: 't2', tags: ['hero', 'relic'], aliases: ['Blade'] }),
  entry('e3', { name: 'Riverton', typeId: 't3', ruleIds: ['r1'] }),
]

describe('filterEntries', () => {
  const ids = (f: Parameters<typeof filterEntries>[1]) => filterEntries(entries, f).map((e) => e.id)

  it('no filter returns everything in order', () => expect(ids({})).toEqual(['e1', 'e2', 'e3']))
  it('by type', () => expect(ids({ typeId: 't2' })).toEqual(['e2']))
  it('by tag; several tags must all match', () => {
    expect(ids({ tags: ['hero'] })).toEqual(['e1', 'e2'])
    expect(ids({ tags: ['hero', 'relic'] })).toEqual(['e2'])
  })
  it('query matches name, case-insensitive', () => expect(ids({ query: 'RIVER' })).toEqual(['e3']))
  it('query matches aliases', () => {
    expect(ids({ query: 'annie' })).toEqual(['e1'])
    expect(ids({ query: 'blad' })).toEqual(['e2'])
  })
  it('query matches tags and notes text', () => {
    expect(ids({ query: 'relic' })).toEqual(['e2'])
    expect(ids({ query: 'the north' })).toEqual(['e1'])
  })
  it('combined filters narrow', () => {
    expect(ids({ typeId: 't1', tags: ['hero'], query: 'ann' })).toEqual(['e1'])
    expect(ids({ typeId: 't2', query: 'ann' })).toEqual([])
  })
  it('blank query is ignored', () => expect(ids({ query: '  ' })).toHaveLength(3))
})

describe('deleteTypePlan', () => {
  const types = ['t1', 't2', 't3']

  it('unknown type is refused; an empty type deletes without a target', () => {
    expect(deleteTypePlan(types, entries, 't9')).toEqual({ ok: false, reason: 'unknown-type' })
    expect(deleteTypePlan([...types, 't4'], entries, 't4')).toEqual({ ok: true, reassign: [], targetId: null })
  })
  it('a type with entries needs a target', () => {
    expect(deleteTypePlan(types, entries, 't1')).toEqual({ ok: false, reason: 'target-required' })
  })
  it('the target must be another existing type', () => {
    expect(deleteTypePlan(types, entries, 't1', 't1')).toEqual({ ok: false, reason: 'bad-target' })
    expect(deleteTypePlan(types, entries, 't1', 'zz')).toEqual({ ok: false, reason: 'bad-target' })
  })
  it('with a target lists the entries to move', () => {
    expect(deleteTypePlan(types, entries, 't1', 't2')).toEqual({ ok: true, reassign: ['e1'], targetId: 't2' })
  })
  it('the last type cannot be deleted', () => {
    expect(deleteTypePlan(['t1'], [], 't1')).toEqual({ ok: false, reason: 'last-type' })
  })
  it('reassignEntries moves only that type and does not mutate', () => {
    expect(reassignEntries(entries, 't1', 't3').map((e) => e.typeId)).toEqual(['t3', 't2', 't3'])
    expect(entries[0].typeId).toBe('t1')
  })
})

describe('links and scans', () => {
  const tl = (id: string, nodes: [string, string[]][]) =>
    timelineSchema.parse({
      version: 1,
      id,
      name: `TL ${id}`,
      nodes: nodes.map(([nid, codexIds]) => ({ id: nid, title: `N ${nid}`, codexIds })),
    })
  const timelines = [tl('t1', [['a', ['e1']], ['b', []]]), tl('t2', [['c', ['e1', 'gone']]])]

  it('lists nodes that link the entry, across timelines', () => {
    expect(nodesUsingEntry(timelines, 'e1')).toEqual([
      { timelineId: 't1', timelineName: 'TL t1', nodeId: 'a', nodeTitle: 'N a' },
      { timelineId: 't2', timelineName: 'TL t2', nodeId: 'c', nodeTitle: 'N c' },
    ])
    expect(nodesUsingEntry(timelines, 'e9')).toEqual([])
  })

  it('a missing or trashed entry shows as a broken node link', () => {
    expect(brokenCodexLinks(timelines, new Set(['e1']))).toEqual([
      { timelineId: 't2', nodeId: 'c', entryId: 'gone' },
    ])
    expect(brokenCodexLinks(timelines, new Set())).toHaveLength(3)
  })

  it('lists entries that use a rule', () => {
    expect(entriesUsingRule(entries, 'r1').map((e) => e.id)).toEqual(['e3'])
    expect(entriesUsingRule(entries, 'r2')).toEqual([])
  })
})

describe('seedCodexTypes', () => {
  async function book(forceReadOnly = false) {
    const io = createMemoryProjectIO()
    const env = makeEnv()
    await createProject(io, { title: 'B', author: 'A', language: 'en' }, env)
    const r = await openProject(io, env, forceReadOnly ? { forceReadOnly: 'locked-elsewhere' } : {})
    if (r.status !== 'ok') throw new Error('open failed')
    return { io, env, project: r.project }
  }

  it('an empty book gets the six starter types, valid on disk', async () => {
    const { io, env, project } = await book()
    await seedCodexTypes(project, env)
    expect(project.manifest.codexTypes).toHaveLength(6)
    const names = project.manifest.codexTypes.map((r) => {
      const res = parseFile(codexTypeSchema, io.files.get(r.path) as string, r.path)
      return res.ok ? res.value.name : null
    })
    expect(names).toEqual(['Character', 'Item', 'Place', 'Country', 'Town', 'Building'])
    const onDisk = JSON.parse(io.files.get('project.json') as string)
    expect(onDisk.codexTypes).toHaveLength(6)
  })

  it('is idempotent', async () => {
    const { io, env, project } = await book()
    await seedCodexTypes(project, env)
    const before = new Map(io.files)
    await seedCodexTypes(project, env)
    expect(io.files).toEqual(before)
  })

  it('does nothing when the book already has entries', async () => {
    const { env, project } = await book()
    project.manifest.codexEntries = [{ id: 'e1', path: 'codex/e1.json' }]
    await seedCodexTypes(project, env)
    expect(project.manifest.codexTypes).toEqual([])
  })

  it('does nothing when read-only', async () => {
    const { io, env, project } = await book(true)
    const before = new Map(io.files)
    await seedCodexTypes(project, env)
    expect(project.manifest.codexTypes).toEqual([])
    expect(io.files).toEqual(before)
  })

  it('writes nothing and keeps the manifest when a write fails', async () => {
    const { io, env, project } = await book()
    const real = project.saveItem
    let n = 0
    project.saveItem = async (...a) => {
      if (++n === 3) throw new Error('disk full')
      return real(...a)
    }
    await expect(seedCodexTypes(project, env)).rejects.toThrow('disk full')
    expect(project.manifest.codexTypes).toEqual([])
    expect([...io.files.keys()].some((k) => k.startsWith('codex/types/'))).toBe(false)
    expect(codexTypePath('x')).toBe('codex/types/x.json')
  })
})
