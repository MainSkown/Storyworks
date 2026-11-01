import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { migrations } from './migrations'
import { createProject, openProject } from './open'
import { createManifest, manifestSchema, MANIFEST_VERSION } from './schemas/manifest'
import { parseFile } from './serialize'
import type { Env } from './types'

const BACKUP_V3 = '.storyworks/backups/pre-migration-v3-'

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const json = (io: MemoryProjectIO, path: string) => JSON.parse(io.files.get(path) as string)
const write = (io: MemoryProjectIO, path: string, value: unknown) =>
  io.files.set(path, JSON.stringify(value, null, 2) + '\n')

const trashed = {
  id: 't-1',
  type: 'timeline',
  title: 'Old timeline',
  originalPath: 'timelines/t-1.json',
  trashPath: '',
  parentId: null,
  index: 0,
  deletedAt: '2020-01-01T00:00:00.000Z',
}

/** A v3 project: manifest downgraded, one trash entry. */
async function v3Project(): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en' }, makeEnv())
  write(io, 'project.json', { ...json(io, 'project.json'), version: 3, trash: [trashed] })
  return io
}

describe('migration v3 to v4', () => {
  it('manifest version is 4 and the step is registered', () => {
    expect(MANIFEST_VERSION).toBe(4)
    expect(migrations.find((m) => m.from === 3)?.to).toBe(4)
  })

  it('opens a v3 project as v4 and keeps trash entries', async () => {
    const io = await v3Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.project.manifest.version).toBe(4)
      expect(r.project.manifest.trash).toEqual([trashed])
    }
  })

  it('writes a manifest that validates and leaves scenes unchanged', async () => {
    const io = await v3Project()
    const scenePath = [...io.files.keys()].find((k) => k.startsWith('manuscript/')) as string
    const before = io.files.get(scenePath)
    await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    expect(io.files.get(scenePath)).toBe(before)
  })

  it('backs up the v3 project before writing', async () => {
    const io = await v3Project()
    const old = io.files.get('project.json')
    await openProject(io, makeEnv())
    const backup = [...io.files.keys()].find(
      (k) => k.startsWith(BACKUP_V3) && k.endsWith('/project.json'),
    )
    expect(io.files.get(backup as string)).toBe(old)
  })

  it('a v4 manifest accepts a node trash entry', () => {
    const base = createManifest({ title: 'T', author: 'A', language: 'en' }, makeEnv())
    const entry = { ...trashed, id: 'n-1', type: 'node', originalPath: '', parentId: 'tl-1' }
    expect(manifestSchema.safeParse({ ...base, trash: [entry] }).success).toBe(true)
  })

  it('a malformed v3 manifest is rejected and every file left untouched', async () => {
    const io = await v3Project()
    write(io, 'project.json', { ...json(io, 'project.json'), title: 5 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })

  it('a newer-than-current version still opens read-only and untouched', async () => {
    const io = await v3Project()
    write(io, 'project.json', { ...json(io, 'project.json'), version: MANIFEST_VERSION + 1 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.project.readOnly).toEqual({ reason: 'newer-version' })
    expect(io.files).toEqual(before)
  })
})
