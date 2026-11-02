import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { createProject } from '../project/open'
import { codexEntryPath, codexTypePath } from '../project/codex'
import { codexEntrySchema } from '../project/schemas/codexEntry'
import { parseFile } from '../project/serialize'
import { EntryRestoreError } from '../project/trash'
import { useRulesStore } from '../rules/store'
import { useTimelinesStore } from '../timeline/store'
import { useCodexStore } from './store'

const META = { title: 'My Book', author: 'Ann', language: 'en' }
let io: MemoryProjectIO

beforeEach(() => {
  io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

async function opened() {
  setActivePinia(createPinia())
  const p = useProjectStore()
  expect(await p.create('book', META)).toBe('opened')
  return { p, c: useCodexStore() }
}

const disk = (id: string) => {
  const res = parseFile(codexEntrySchema, io.files.get(codexEntryPath(id)) as string, 'x')
  if (!res.ok) throw new Error('entry invalid on disk')
  return res.value
}
const manifest = () => JSON.parse(io.files.get('project.json') as string)

describe('open', () => {
  it('a new book gets the six starter types and no entries', async () => {
    const { c } = await opened()
    expect(c.types.map((t) => t.name)).toEqual([
      'Character',
      'Item',
      'Place',
      'Country',
      'Town',
      'Building',
    ])
    expect(c.entries).toEqual([])
  })

  it('reopening seeds nothing more', async () => {
    const { p } = await opened()
    await p.flush()
    const snap = new Map([...io.files].filter(([k]) => !k.endsWith('.lock') && !k.includes('/backups/')))
    await p.open('book')
    expect(new Map([...io.files].filter(([k]) => !k.endsWith('.lock') && !k.includes('/backups/')))).toEqual(snap)
  })

  it('read-only open creates nothing and refuses edits', async () => {
    const { p } = await opened()
    await p.close()
    const bare = createMemoryProjectIO()
    io = bare
    await createProject(bare, META)
    const m = JSON.parse(bare.files.get('project.json') as string)
    bare.files.set('project.json', JSON.stringify({ ...m, kind: 'other' }))
    const before = new Map(bare.files)
    expect(await p.open('book2')).toBe('opened')
    expect(bare.files).toEqual(before)
    expect(useCodexStore().types).toEqual([])
    expect(await useCodexStore().createEntry()).toBeNull()
  })

  it('closing the project clears the store', async () => {
    const { p, c } = await opened()
    await c.createEntry({ name: 'Anna' })
    await p.close()
    expect(c.entries).toEqual([])
    expect(c.types).toEqual([])
    expect(c.selectedId).toBeNull()
  })

  it('an invalid entry file is listed with its field error, others load, file untouched', async () => {
    const { p, c } = await opened()
    const a = (await c.createEntry({ name: 'A' })) as string
    const b = (await c.createEntry({ name: 'B' })) as string
    await p.flush()
    const bad = JSON.stringify({ ...disk(b), name: 5 })
    io.files.set(codexEntryPath(b), bad)
    await p.open('book')
    const c2 = useCodexStore()
    expect(c2.entries.map((x) => x.id)).toEqual([a])
    expect(c2.entryList.find((e) => e.id === b)).toMatchObject({
      status: 'invalid',
      error: { field: 'name' },
    })
    expect(c2.updateEntry(b, { name: 'x' })).toEqual({ ok: false, reason: 'unknown-entry' })
    await p.flush()
    expect(io.files.get(codexEntryPath(b))).toBe(bad)
  })

  it('an entry with duplicate aliases on disk is invalid and left alone', async () => {
    const { p, c } = await opened()
    const a = (await c.createEntry({ name: 'A' })) as string
    await p.flush()
    const bad = JSON.stringify({ ...disk(a), aliases: ['x', 'X'] })
    io.files.set(codexEntryPath(a), bad)
    await p.open('book')
    expect(useCodexStore().entryList[0]).toMatchObject({
      status: 'invalid',
      error: { field: 'aliases' },
    })
    expect(io.files.get(codexEntryPath(a))).toBe(bad)
  })

  it('a file whose id differs from the manifest is invalid', async () => {
    const { p, c } = await opened()
    const a = (await c.createEntry({ name: 'A' })) as string
    await p.flush()
    io.files.set(codexEntryPath(a), JSON.stringify({ ...disk(a), id: 'other' }))
    await p.open('book')
    expect(useCodexStore().entryList[0]).toMatchObject({
      status: 'invalid',
      error: { field: 'id' },
    })
  })

  it('a listed entry whose file is gone is marked missing', async () => {
    const { p, c } = await opened()
    const a = (await c.createEntry()) as string
    await p.flush()
    io.files.delete(codexEntryPath(a))
    await p.open('book')
    expect(useCodexStore().entryList[0].status).toBe('missing')
  })

  it('an invalid type file is listed as invalid and left alone', async () => {
    const { p, c } = await opened()
    const id = c.types[0].id
    await p.flush()
    io.files.set(codexTypePath(id), '{"nope":')
    await p.open('book')
    const c2 = useCodexStore()
    expect(c2.typeList[0].status).toBe('invalid')
    expect(c2.types).toHaveLength(5)
    expect(io.files.get(codexTypePath(id))).toBe('{"nope":')
  })
})

describe('entries', () => {
  it('create, edit and autosave to the file and manifest', async () => {
    const { p, c } = await opened()
    const id = (await c.createEntry({ name: 'Anna' })) as string
    expect(c.selectedId).toBe(id)
    expect(disk(id).typeId).toBe(c.types[0].id)
    expect(
      c.updateEntry(id, {
        name: ' Anna K ',
        aliases: [' Annie ', 'annie', '', 'Ann'],
        tags: [' a ', 'a', 'b'],
        typeId: c.types[1].id,
        ruleIds: ['r1', 'r1'],
        appendixText: 'Hero',
        includeInAppendices: true,
      }),
    ).toEqual({ ok: true })
    await p.flush()
    expect(disk(id)).toMatchObject({
      name: 'Anna K',
      aliases: ['Annie', 'Ann'],
      tags: ['a', 'b'],
      typeId: c.types[1].id,
      ruleIds: ['r1'],
      appendixText: 'Hero',
      includeInAppendices: true,
    })
    expect(manifest().codexEntries).toEqual([{ id, path: codexEntryPath(id), title: 'Anna K' }])
  })

  it('a type that does not exist is rejected', async () => {
    const { c } = await opened()
    const id = (await c.createEntry()) as string
    expect(c.updateEntry(id, { typeId: 'zz' })).toEqual({ ok: false, reason: 'unknown-type' })
    expect(await c.createEntry({ typeId: 'zz' })).toBeNull()
  })

  it('order follows the manifest', async () => {
    const { c } = await opened()
    const ids = [(await c.createEntry()) as string, (await c.createEntry()) as string]
    expect(c.entries.map((x) => x.id)).toEqual(ids)
    expect(c.groups.flatMap((g) => g.entries.map((x) => x.id))).toEqual(ids)
  })

  it('edits are refused when the project is read-only', async () => {
    const { p, c } = await opened()
    const id = (await c.createEntry()) as string
    ;(p.project as { readOnly: unknown }).readOnly = { reason: 'locked-elsewhere' }
    expect(c.updateEntry(id, { name: 'x' })).toEqual({ ok: false, reason: 'read-only' })
    expect(await c.createEntry()).toBeNull()
    expect(await c.deleteEntry(id)).toBe(false)
    expect(await c.createType('X')).toBeNull()
  })

  it('an image is copied to assets/ and only the relative path is stored', async () => {
    const { p, c } = await opened()
    const id = (await c.createEntry()) as string
    expect(await c.importImage(id, new Uint8Array([1, 2, 3]), 'png')).toEqual({ ok: true })
    const path = c.entries[0].image as string
    expect(path).toMatch(/^assets\/[^/]+\.png$/)
    expect(io.files.has(path)).toBe(true)
    await p.flush()
    expect(disk(id).image).toBe(path)
  })

  it('an image path outside assets/ is refused', async () => {
    const { c } = await opened()
    const id = (await c.createEntry()) as string
    for (const bad of ['/home/me/a.png', 'assets/../a.png', 'pics/a.png'])
      expect(c.updateEntry(id, { image: bad })).toEqual({ ok: false, reason: 'bad-image' })
    expect(c.updateEntry(id, { image: null })).toEqual({ ok: true })
  })

  it('delete trashes the file; the node link is left and shows as broken; restore fixes it', async () => {
    const { p, c } = await opened()
    const t = useTimelinesStore()
    const id = (await c.createEntry({ name: 'Anna' })) as string
    const node = t.addNode()
    if (!node.ok) throw new Error('no node')
    t.updateNode(node.id, { codexIds: [id] })
    await p.flush()
    expect(c.usedInNodes(id).map((u) => u.nodeId)).toEqual([node.id])
    expect(c.brokenLinks).toEqual([])

    expect(await c.deleteEntry(id)).toBe(true)
    expect(c.entries).toEqual([])
    expect(io.files.has(codexEntryPath(id))).toBe(false)
    expect(p.trash.map((e) => [e.id, e.type, e.title])).toEqual([[id, 'entry', 'Anna']])
    expect(t.current?.nodes[0].codexIds).toEqual([id])
    expect(c.brokenLinks.map((b) => b.entryId)).toEqual([id])

    await p.restoreItem(id)
    expect(c.entries.map((x) => x.id)).toEqual([id])
    expect(c.brokenLinks).toEqual([])
    expect(p.trash).toEqual([])
  })

  it('restore puts the entry back at the same position', async () => {
    const { p, c } = await opened()
    const ids = [
      (await c.createEntry()) as string,
      (await c.createEntry()) as string,
      (await c.createEntry()) as string,
    ]
    await c.deleteEntry(ids[1])
    await p.restoreItem(ids[1])
    expect(c.entries.map((x) => x.id)).toEqual(ids)
  })

  it('restore into a missing type moves the entry to the first type', async () => {
    const { p, c } = await opened()
    const [a, b] = c.types
    const id = (await c.createEntry({ typeId: b.id })) as string
    await c.deleteEntry(id)
    expect(await c.deleteType(b.id)).toEqual({ ok: true, moved: 0 })
    await p.restoreItem(id)
    expect(c.entries[0].typeId).toBe(a.id)
    await p.flush()
    expect(disk(id).typeId).toBe(a.id)
  })

  it('restore with an invalid trashed file is refused and the file untouched', async () => {
    const { p, c } = await opened()
    const id = (await c.createEntry()) as string
    await c.deleteEntry(id)
    const path = p.trash[0].trashPath
    io.files.set(path, '{"bad":1}')
    const err = await p.restoreItem(id).catch((e) => e)
    expect(err).toBeInstanceOf(EntryRestoreError)
    expect(io.files.get(path)).toBe('{"bad":1}')
    expect(p.trash).toHaveLength(1)
  })

  it('rule links: back-links by scan and broken rule ids after the rule is trashed', async () => {
    const { c } = await opened()
    const r = useRulesStore()
    const rule = (await r.createRule({ title: 'Mana' })) as string
    const id = (await c.createEntry({ name: 'Anna' })) as string
    c.updateEntry(id, { ruleIds: [rule] })
    expect(c.usedByRule(rule).map((e) => e.id)).toEqual([id])
    expect(c.brokenRuleLinks).toEqual([])
    await r.deleteRule(rule)
    expect(c.brokenRuleLinks).toEqual([{ entryId: id, ruleId: rule }])
  })
})

describe('types', () => {
  it('create, rename, recolour, change icon; saved to file and manifest', async () => {
    const { p, c } = await opened()
    const id = (await c.createType('Faction', '#111111', 'groups')) as string
    expect(c.updateType(id, { name: ' Factions ', color: '#222222', icon: 'flag' })).toEqual({
      ok: true,
    })
    await p.flush()
    expect(c.types.at(-1)).toMatchObject({ id, name: 'Factions', color: '#222222', icon: 'flag' })
    expect(JSON.parse(io.files.get(codexTypePath(id)) as string)).toMatchObject({
      name: 'Factions',
      icon: 'flag',
    })
    expect(manifest().codexTypes.at(-1)).toEqual({ id, path: codexTypePath(id), title: 'Factions' })
  })

  it('an empty name is rejected', async () => {
    const { c } = await opened()
    expect(await c.createType('  ')).toBeNull()
    expect(c.updateType(c.types[0].id, { name: ' ' })).toEqual({ ok: false, reason: 'empty-name' })
  })

  it('delete without entries removes the file and the listing', async () => {
    const { p, c } = await opened()
    const id = c.types[5].id
    expect(await c.deleteType(id)).toEqual({ ok: true, moved: 0 })
    await p.flush()
    expect(io.files.has(codexTypePath(id))).toBe(false)
    expect(manifest().codexTypes.map((t: { id: string }) => t.id)).not.toContain(id)
    expect(p.trash).toEqual([])
  })

  it('delete with entries needs a target, then moves them', async () => {
    const { p, c } = await opened()
    const [a, b] = c.types
    const x = (await c.createEntry({ typeId: a.id })) as string
    expect(await c.deleteType(a.id)).toEqual({ ok: false, reason: 'target-required' })
    expect(c.types).toHaveLength(6)
    expect(await c.deleteType(a.id, b.id)).toEqual({ ok: true, moved: 1 })
    await p.flush()
    expect(disk(x).typeId).toBe(b.id)
    expect(c.types.map((t) => t.id)).not.toContain(a.id)
  })

  it('the last type cannot be deleted', async () => {
    const { c } = await opened()
    for (const t of c.types.slice(1)) await c.deleteType(t.id)
    expect(await c.deleteType(c.types[0].id)).toEqual({ ok: false, reason: 'last-type' })
    expect(c.types).toHaveLength(1)
  })

  it('deleting every type on a book with entries does not seed again on reopen', async () => {
    const { p, c } = await opened()
    await c.createEntry()
    await p.flush()
    io.files.set('project.json', JSON.stringify({ ...manifest(), codexTypes: [] }))
    await p.open('book')
    expect(useCodexStore().types).toEqual([])
  })
})

describe('filter', () => {
  it('groups follow type order and filters narrow the list', async () => {
    const { c } = await opened()
    const [a, b] = c.types
    const x = (await c.createEntry({ name: 'Sword', typeId: b.id })) as string
    await c.createEntry({ name: 'Anna', typeId: a.id })
    c.updateEntry(x, { tags: ['relic'], aliases: ['Blade'] })
    expect(c.groups.filter((g) => g.entries.length).map((g) => g.type?.name)).toEqual([
      'Character',
      'Item',
    ])
    c.toggleTag('relic')
    expect(c.filteredEntries.map((f) => f.id)).toEqual([x])
    c.clearFilter()
    c.setQuery('blade')
    expect(c.filteredEntries.map((f) => f.name)).toEqual(['Sword'])
    expect(c.allTags).toEqual(['relic'])
  })
})
