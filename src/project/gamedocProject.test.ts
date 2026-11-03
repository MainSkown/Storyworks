import { describe, expect, it } from 'vitest'
import { seedGameDocument } from './gamedoc'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import { GAME_OVERVIEW_FILE, gameOverviewSchema } from './schemas/gameOverview'
import { mechanicSchema } from './schemas/mechanic'
import { parseFile } from './serialize'
import { MechanicRestoreError } from './trash'
import { docToText } from './plainText'
import { itemGroup } from '../history/itemLabel'
import { viewManifest } from '../history/manifestView'
import type { Env } from './types'

const makeEnv = (): Env => {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}
const make = (kind: string, language = 'en') =>
  createProject(createMemoryProjectIO(), { title: 'T', author: 'A', language, kind }, makeEnv())

describe('seedGameDocument', () => {
  it('a game project gets six categories and a starter overview', async () => {
    const p = await make('game')
    await seedGameDocument(p, makeEnv())
    expect(p.manifest.mechanicCategories.map((c) => c.title)).toEqual([
      'Core loop', 'Combat', 'Economy', 'Progression', 'Exploration', 'Interface',
    ])
    const text = (await p.io.readText(GAME_OVERVIEW_FILE)) as string
    const r = parseFile(gameOverviewSchema, text, GAME_OVERVIEW_FILE)
    expect(r.ok && docToText(r.value.content)).toContain('Pillars')
    expect(p.manifest.gameOverview?.path).toBe(GAME_OVERVIEW_FILE)
  })

  it('writes Polish names for a Polish project', async () => {
    const p = await make('game', 'pl')
    await seedGameDocument(p, makeEnv())
    expect(p.manifest.mechanicCategories[0].title).toBe('Główna pętla')
  })

  it('runs once: a second call changes nothing', async () => {
    const p = await make('game')
    await seedGameDocument(p, makeEnv())
    const before = JSON.stringify(p.manifest)
    await seedGameDocument(p, makeEnv())
    expect(JSON.stringify(p.manifest)).toBe(before)
  })

  it('does not bring categories back after the user deleted them all while mechanics exist', async () => {
    const p = await make('game')
    await seedGameDocument(p, makeEnv())
    p.manifest.mechanicCategories = []
    p.manifest.mechanics = [{ id: 'm', path: 'game-doc/mechanics/m.json', title: 'M' }]
    await seedGameDocument(p, makeEnv())
    expect(p.manifest.mechanicCategories).toEqual([])
  })

  it('skips books and screenplays, and read-only projects', async () => {
    for (const kind of ['book', 'screenplay']) {
      const p = await make(kind)
      await seedGameDocument(p, makeEnv())
      expect(p.manifest.mechanicCategories).toEqual([])
      expect(p.manifest.gameOverview).toBeNull()
    }
    const g = await make('game')
    const ro = { ...g, readOnly: { reason: 'locked-elsewhere' } } as typeof g
    await seedGameDocument(ro, makeEnv())
    expect(g.manifest.gameOverview).toBeNull()
  })

  it('a migrated v17 game project gets the starter files on first open', async () => {
    const io = createMemoryProjectIO()
    await createProject(io, { title: 'Old', author: 'A', language: 'en', kind: 'game' }, makeEnv())
    const m = JSON.parse(io.files.get('project.json') as string)
    io.files.set('project.json', JSON.stringify({ ...m, version: 17, gameOverview: undefined, mechanicCategories: undefined }))
    const opened = await openProject(io, makeEnv())
    expect(opened.status).toBe('ok')
    if (opened.status !== 'ok') return
    await seedGameDocument(opened.project, makeEnv())
    expect(opened.project.manifest.mechanicCategories).toHaveLength(6)
    expect(opened.project.manifest.gameOverview).not.toBeNull()
  })
})

const addMechanic = async (io: MemoryProjectIO, p: Awaited<ReturnType<typeof make>>) => {
  const path = 'game-doc/mechanics/m1.json'
  await p.saveItem(path, mechanicSchema, mechanicSchema.parse({ version: 1, id: 'm1', title: 'Stamina', categoryId: 'c' }))
  p.manifest.mechanics = [{ id: 'm1', path, title: 'Stamina' }]
  await p.saveManifest()
  return path
}

describe('mechanic files', () => {
  it('trash moves the file and restore puts it back at the same position', async () => {
    const io = createMemoryProjectIO()
    const p = await createProject(io, { title: 'T', author: 'A', language: 'en', kind: 'game' }, makeEnv())
    const path = await addMechanic(io, p)
    const entry = await p.trashMechanic('m1', 'Stamina')
    expect(entry.type).toBe('mechanic')
    expect(p.manifest.mechanics).toEqual([])
    expect(io.files.has(path)).toBe(false)
    await p.restoreMechanic('m1')
    expect(p.manifest.mechanics.map((m) => m.id)).toEqual(['m1'])
    expect(io.files.has(path)).toBe(true)
    expect(p.manifest.trash).toEqual([])
  })

  it('restoring a file that no longer validates is refused and changes nothing', async () => {
    const io = createMemoryProjectIO()
    const p = await createProject(io, { title: 'T', author: 'A', language: 'en', kind: 'game' }, makeEnv())
    await addMechanic(io, p)
    const entry = await p.trashMechanic('m1', 'Stamina')
    io.files.set(entry.trashPath, '{"version": 1, "id": "m1"}')
    await expect(p.restoreMechanic('m1')).rejects.toBeInstanceOf(MechanicRestoreError)
    expect(p.manifest.trash).toHaveLength(1)
    expect(p.manifest.mechanics).toEqual([])
  })

  it('a mechanic file with a different id than the manifest lists is reported as invalid on open', async () => {
    const io = createMemoryProjectIO()
    const p = await createProject(io, { title: 'T', author: 'A', language: 'en', kind: 'game' }, makeEnv())
    const path = await addMechanic(io, p)
    io.files.set(path, JSON.stringify({ version: 1, id: 'other', title: 'X', categoryId: 'c' }))
    const opened = await openProject(io, makeEnv())
    expect(opened.status === 'ok' && opened.issues.map((i) => i.kind)).toEqual(['invalid'])
  })

  it('a malformed overview is reported and left untouched', async () => {
    const io = createMemoryProjectIO()
    const p = await createProject(io, { title: 'T', author: 'A', language: 'en', kind: 'game' }, makeEnv())
    await seedGameDocument(p, makeEnv())
    io.files.set(GAME_OVERVIEW_FILE, '{"version": 1, "junk": true}')
    const opened = await openProject(io, makeEnv())
    expect(opened.status === 'ok' && opened.issues.map((i) => i.kind)).toEqual(['invalid'])
    expect(io.files.get(GAME_OVERVIEW_FILE)).toBe('{"version": 1, "junk": true}')
  })
})

describe('history', () => {
  it('lists mechanics, categories, overview and glossary in a Game document group', async () => {
    const io = createMemoryProjectIO()
    const p = await createProject(io, { title: 'T', author: 'A', language: 'en', kind: 'game' }, makeEnv())
    await seedGameDocument(p, makeEnv())
    await addMechanic(io, p)
    p.manifest.glossary = { id: 'g', path: 'game-doc/glossary.json', title: 'Glossary' }
    const view = viewManifest(JSON.stringify(p.manifest))
    const types = new Set(view?.entries.map((e) => e.type))
    for (const t of ['mechanic', 'mechanicCategory', 'gameOverview', 'glossary'] as const) {
      expect(types.has(t)).toBe(true)
      expect(itemGroup(t)).toBe('gamedoc')
    }
  })
})
