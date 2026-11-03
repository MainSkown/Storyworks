import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { GAME_OVERVIEW_FILE } from '../project/schemas/gameOverview'
import { GLOSSARY_FILE } from '../project/schemas/glossary'
import { mechanicPath } from '../project/gamedoc'
import { MechanicRestoreError } from '../project/trash'
import { useGlossaryStore } from './glossaryStore'
import { useMechanicsStore } from './mechanicsStore'
import { useOverviewStore } from './overviewStore'

const META = { title: 'My Game', author: 'Ann', language: 'en' }
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

async function opened(kind = 'game') {
  setActivePinia(createPinia())
  const p = useProjectStore()
  expect(await p.create(kind, { ...META, kind })).toBe('opened')
  return { p, m: useMechanicsStore(), g: useGlossaryStore(), o: useOverviewStore() }
}
const disk = (path: string) => JSON.parse(io.files.get(path) as string)
const manifest = () => disk('project.json')

describe('open', () => {
  it('a new game has six categories, no mechanics and a starter overview', async () => {
    const { m, o } = await opened()
    expect(m.categories.map((c) => c.name)).toHaveLength(6)
    expect(m.mechanics).toEqual([])
    expect(JSON.stringify(o.content)).toContain('Pillars')
  })

  it('a book has none of it and refuses to create', async () => {
    const { m, g } = await opened('book')
    expect(m.categories).toEqual([])
    expect(await m.createMechanic()).toBeNull()
    expect(await g.add('Gold', 'Money')).toBeNull()
  })

  it('an invalid mechanic file is listed as invalid; others load; file untouched', async () => {
    const { p, m } = await opened()
    const a = (await m.createMechanic({ title: 'A' })) as string
    const b = (await m.createMechanic({ title: 'B' })) as string
    await p.flush()
    io.files.set(mechanicPath(a), '{"version": 1, "id": "' + a + '"}')
    await p.close()
    await p.open('game')
    const mm = useMechanicsStore()
    expect(mm.mechanics.map((x) => x.id)).toEqual([b])
    expect(mm.mechanicEntries.find((e) => e.id === a)?.status).toBe('invalid')
    expect(io.files.get(mechanicPath(a))).toBe('{"version": 1, "id": "' + a + '"}')
  })
})

describe('mechanics', () => {
  it('create and edit save to the file and the manifest', async () => {
    const { p, m } = await opened()
    const id = (await m.createMechanic({ title: 'Stamina' })) as string
    expect(m.updateMechanic(id, { title: ' Endurance ', status: 'designed', tags: ['hud', 'hud', ' '] })).toEqual({ ok: true })
    await p.flush()
    expect(disk(mechanicPath(id))).toMatchObject({ title: 'Endurance', status: 'designed', tags: ['hud'] })
    expect(manifest().mechanics[0].title).toBe('Endurance')
  })

  it('a missing category or duplicate parameter ids are rejected', async () => {
    const { m } = await opened()
    const id = (await m.createMechanic()) as string
    expect(m.updateMechanic(id, { categoryId: 'nope' })).toEqual({ ok: false, reason: 'unknown-category' })
    const dup = [{ id: 'p', name: 'A', value: '1' }, { id: 'p', name: 'B', value: '2' }]
    expect(m.updateMechanic(id, { parameters: dup })).toEqual({ ok: false, reason: 'invalid' })
    expect(m.selected?.parameters).toEqual([])
  })

  it('links are added once and removed; saved to the file', async () => {
    const { p, m } = await opened()
    const id = (await m.createMechanic()) as string
    expect(m.addLink(id, { kind: 'variable', id: 'v1' })).toEqual({ ok: true })
    m.addLink(id, { kind: 'variable', id: 'v1' })
    m.addLink(id, { kind: 'mechanic', id })
    await p.flush()
    expect(disk(mechanicPath(id)).links).toEqual([{ kind: 'variable', id: 'v1' }])
    m.removeLink(id, { kind: 'variable', id: 'v1' })
    await p.flush()
    expect(disk(mechanicPath(id)).links).toEqual([])
  })

  it('move changes the manifest order', async () => {
    const { p, m } = await opened()
    const a = (await m.createMechanic({ title: 'A' })) as string
    const b = (await m.createMechanic({ title: 'B' })) as string
    const c = (await m.createMechanic({ title: 'C' })) as string
    m.moveMechanic(c, 0)
    expect(m.mechanics.map((x) => x.id)).toEqual([c, a, b])
    await p.flush()
    expect(manifest().mechanics.map((x: { id: string }) => x.id)).toEqual([c, a, b])
  })

  it('delete trashes it; restore into a missing category uses the first category', async () => {
    const { p, m } = await opened()
    const cat = (await m.createCategory('Temp')) as string
    const id = (await m.createMechanic({ categoryId: cat })) as string
    expect(await m.deleteMechanic(id)).toBe(true)
    expect(m.mechanics).toEqual([])
    expect(manifest().trash[0]).toMatchObject({ id, type: 'mechanic' })
    // category removed while the mechanic is in the trash
    expect((await m.deleteCategory(cat)).ok).toBe(true)
    await p.restoreItem(id)
    expect(m.selected?.categoryId ?? m.mechanics[0].categoryId).toBe(m.categories[0].id)
  })

  it('restore with an invalid trashed file is refused', async () => {
    const { p, m } = await opened()
    const id = (await m.createMechanic()) as string
    await m.deleteMechanic(id)
    io.files.set(manifest().trash[0].trashPath, '{}')
    await expect(p.restoreItem(id)).rejects.toBeInstanceOf(MechanicRestoreError)
    expect(manifest().trash).toHaveLength(1)
  })

  it('filter by category, status and query', async () => {
    const { m } = await opened()
    const [c1, c2] = m.categories
    const a = (await m.createMechanic({ title: 'Parry', categoryId: c1.id })) as string
    await m.createMechanic({ title: 'Shops', categoryId: c2.id })
    m.updateMechanic(a, { status: 'implemented' })
    m.setStatusFilter('implemented')
    expect(m.filteredMechanics.map((x) => x.id)).toEqual([a])
    m.clearFilter()
    m.setCategoryFilter(c2.id)
    expect(m.filteredMechanics.map((x) => x.title)).toEqual(['Shops'])
    m.setCategoryFilter(null)
    m.setQuery('par')
    expect(m.filteredMechanics.map((x) => x.id)).toEqual([a])
  })
})

describe('mechanic categories', () => {
  it('delete with mechanics needs a target, then moves them', async () => {
    const { m } = await opened()
    const [c1, c2] = m.categories
    const id = (await m.createMechanic({ categoryId: c1.id })) as string
    expect(await m.deleteCategory(c1.id)).toEqual({ ok: false, reason: 'target-required' })
    expect(await m.deleteCategory(c1.id, c2.id)).toEqual({ ok: true, moved: 1 })
    expect(m.mechanics.find((x) => x.id === id)?.categoryId).toBe(c2.id)
    expect(m.categories.find((c) => c.id === c1.id)).toBeUndefined()
  })

  it('an empty name is rejected', async () => {
    const { m } = await opened()
    expect(m.updateCategory(m.categories[0].id, { name: ' ' })).toEqual({ ok: false, reason: 'empty-name' })
    expect(await m.createCategory(' ')).toBeNull()
  })
})

describe('overview', () => {
  it('edits are saved to the file', async () => {
    const { p, o } = await opened()
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }
    expect(o.setContent(doc)).toBe(true)
    await p.flush()
    expect(disk(GAME_OVERVIEW_FILE).content).toEqual(doc)
  })

  it('an invalid overview file is shown as invalid, refuses edits and stays untouched', async () => {
    const { p } = await opened()
    await p.flush()
    io.files.set(GAME_OVERVIEW_FILE, '{"version": 1, "junk": true}')
    await p.close()
    await p.open('game')
    const o = useOverviewStore()
    expect(o.status).toBe('invalid')
    expect(o.setContent({ type: 'doc', content: [] })).toBe(false)
    expect(io.files.get(GAME_OVERVIEW_FILE)).toBe('{"version": 1, "junk": true}')
  })
})

describe('glossary', () => {
  it('the first entry creates the file and lists it; edit and remove are saved', async () => {
    const { p, g } = await opened()
    expect(manifest().glossary).toBeNull()
    const id = (await g.add(' Gold ', 'Money')) as string
    await p.flush()
    expect(manifest().glossary.path).toBe(GLOSSARY_FILE)
    expect(g.update(id, { definition: 'Coins' })).toBe(true)
    await p.flush()
    expect(disk(GLOSSARY_FILE).entries).toEqual([{ id, term: 'Gold', definition: 'Coins' }])
    expect(g.remove(id)).toBe(true)
    await p.flush()
    expect(disk(GLOSSARY_FILE).entries).toEqual([])
  })

  it('an empty term is rejected', async () => {
    const { g } = await opened()
    expect(await g.add('  ', 'x')).toBeNull()
  })

  it('an invalid glossary file refuses changes and stays untouched', async () => {
    const { p, g } = await opened()
    await g.add('Gold', '')
    await p.flush()
    io.files.set(GLOSSARY_FILE, '{"version": 1, "entries": 5}')
    await p.close()
    await p.open('game')
    const g2 = useGlossaryStore()
    expect(g2.status).toBe('invalid')
    expect(await g2.add('Gem', '')).toBeNull()
    expect(io.files.get(GLOSSARY_FILE)).toBe('{"version": 1, "entries": 5}')
  })
})
