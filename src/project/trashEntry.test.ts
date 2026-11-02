import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import { codexEntryPath } from './codex'
import { CODEX_ENTRY_VERSION, codexEntrySchema } from './schemas/codexEntry'
import { manifestSchema } from './schemas/manifest'
import { parseFile, serialize } from './serialize'
import { EntryRestoreError } from './trash'
import type { Env, OpenProject } from './types'

const makeEnv = (): Env => {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}
const TRASHED = (id: string) => `.storyworks/trash/${id}/${id}.json`

/** Book with entries r1, r2, r3 listed in that order. */
async function seed(): Promise<{ io: MemoryProjectIO; project: OpenProject }> {
  const io = createMemoryProjectIO()
  const env = makeEnv()
  const created = await createProject(io, { title: 'T', author: 'A', language: 'en' }, env)
  for (const id of ['e1', 'e2', 'e3']) {
    await created.saveItem(codexEntryPath(id), codexEntrySchema, codexEntrySchema.parse({ version: CODEX_ENTRY_VERSION, id, typeId: 't', name: `Entry ${id}` }))
    created.manifest.codexEntries = [...created.manifest.codexEntries, { id, path: codexEntryPath(id), title: `Entry ${id}` }]
  }
  await created.saveManifest()
  const r = await openProject(io, env)
  if (r.status !== 'ok') throw new Error('open failed')
  return { io, project: r.project }
}

const diskManifest = (io: MemoryProjectIO) => {
  const r = parseFile(manifestSchema, io.files.get('project.json') as string, 'project.json')
  if (!r.ok) throw new Error('manifest invalid')
  return r.value
}

describe('trashEntry', () => {
  it('moves the file, unlists the entry and writes an entry trash record', async () => {
    const { io, project } = await seed()
    const entry = await project.trashEntry('e2', 'Entry e2')
    expect(entry).toMatchObject({ id: 'e2', type: 'entry', title: 'Entry e2', originalPath: codexEntryPath('e2'), index: 1 })
    expect(io.files.has(codexEntryPath('e2'))).toBe(false)
    expect(io.files.has(TRASHED('e2'))).toBe(true)
    const m = diskManifest(io)
    expect(m.codexEntries.map((r) => r.id)).toEqual(['e1', 'e3'])
    expect(m.trash.map((t) => [t.id, t.type])).toEqual([['e2', 'entry']])
  })

  it('refuses an unlisted entry', async () => {
    const { project } = await seed()
    await expect(project.trashEntry('zz', 'x')).rejects.toThrow()
  })

  it('refuses when read-only and writes nothing', async () => {
    const { io } = await seed()
    const m = JSON.parse(io.files.get('project.json') as string)
    io.files.set('project.json', JSON.stringify({ ...m, version: 99 }))
    const r = await openProject(io, makeEnv())
    if (r.status !== 'ok') throw new Error('open failed')
    const before = new Map(io.files)
    await expect(r.project.trashEntry('e1', 'x')).rejects.toThrow(/read-only/)
    expect(io.files).toEqual(before)
  })
})

describe('restoreEntry', () => {
  it('puts the same file back at the same position', async () => {
    const { io, project } = await seed()
    const original = io.files.get(codexEntryPath('e2'))
    await project.trashEntry('e2', 'Entry e2')
    await project.restoreEntry('e2')
    expect(io.files.get(codexEntryPath('e2'))).toBe(original)
    expect(io.files.has(TRASHED('e2'))).toBe(false)
    const m = diskManifest(io)
    expect(m.codexEntries.map((r) => r.id)).toEqual(['e1', 'e2', 'e3'])
    expect(m.trash).toEqual([])
  })

  it('refused when the trashed file is invalid; nothing changes', async () => {
    const { io, project } = await seed()
    await project.trashEntry('e1', 'Entry e1')
    io.files.set(TRASHED('e1'), serialize(codexEntrySchema, codexEntrySchema.parse({ version: CODEX_ENTRY_VERSION, id: 'e1', typeId: 't', name: 'x' })).replace('"name": "x"', '"name": 5'))
    const before = new Map(io.files)
    const err = await project.restoreEntry('e1').catch((e) => e)
    expect(err).toBeInstanceOf(EntryRestoreError)
    expect((err as EntryRestoreError).code).toBe('file-invalid')
    expect(io.files).toEqual(before)
  })

  it('refused when the file belongs to another id', async () => {
    const { io, project } = await seed()
    await project.trashEntry('e1', 'Entry e1')
    io.files.set(TRASHED('e1'), io.files.get(codexEntryPath('e3')) as string)
    const err = await project.restoreEntry('e1').catch((e) => e)
    expect((err as EntryRestoreError).code).toBe('file-invalid')
  })

  it('refused when the trashed file is missing', async () => {
    const { io, project } = await seed()
    await project.trashEntry('e1', 'Entry e1')
    io.files.delete(TRASHED('e1'))
    const err = await project.restoreEntry('e1').catch((e) => e)
    expect((err as EntryRestoreError).code).toBe('file-missing')
  })

  it('refused when something already sits at the original path', async () => {
    const { io, project } = await seed()
    await project.trashEntry('e1', 'Entry e1')
    io.files.set(codexEntryPath('e1'), 'other')
    const err = await project.restoreEntry('e1').catch((e) => e)
    expect((err as EntryRestoreError).code).toBe('path-exists')
    expect(io.files.get(codexEntryPath('e1'))).toBe('other')
  })

  it('refused for an id that is not in the trash', async () => {
    const { project } = await seed()
    const err = await project.restoreEntry('e1').catch((e) => e)
    expect((err as EntryRestoreError).code).toBe('not-in-trash')
  })
})
