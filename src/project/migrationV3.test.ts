import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { migrations } from './migrations'
import { createProject, openProject } from './open'
import { createManifest, manifestSchema, MANIFEST_VERSION } from './schemas/manifest'
import { parseFile } from './serialize'
import type { Env } from './types'

const BACKUP_V2 = '.storyworks/backups/pre-migration-v2-'

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const json = (io: MemoryProjectIO, path: string) => JSON.parse(io.files.get(path) as string)
const write = (io: MemoryProjectIO, path: string, value: unknown) =>
  io.files.set(path, JSON.stringify(value, null, 2) + '\n')

const trashed = {
  id: 't-1',
  type: 'chapter',
  title: 'Old chapter',
  originalPath: '',
  trashPath: '',
  parentId: null,
  index: 0,
  deletedAt: '2020-01-01T00:00:00.000Z',
}

/** A v2 project (scene files are already v2): manifest downgraded, one trash entry. */
async function v2Project(): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en' }, makeEnv())
  write(io, 'project.json', { ...json(io, 'project.json'), version: 2, trash: [trashed] })
  return io
}

describe('migration v2 to v3', () => {
  it('the v2 to v3 step is registered', () => {
    expect(migrations.find((m) => m.from === 2)?.to).toBe(3)
  })

  it('opens a v2 project at the current version and keeps trash entries', async () => {
    const io = await v2Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.project.manifest.version).toBe(MANIFEST_VERSION)
      expect(r.project.manifest.trash).toEqual([trashed])
    }
  })

  it('writes a manifest that validates and leaves scenes unchanged', async () => {
    const io = await v2Project()
    const scenePath = [...io.files.keys()].find((k) => k.startsWith('manuscript/')) as string
    const before = io.files.get(scenePath)
    await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    expect(io.files.get(scenePath)).toBe(before)
  })

  it('backs up the v2 project before writing', async () => {
    const io = await v2Project()
    const old = io.files.get('project.json')
    await openProject(io, makeEnv())
    const backup = [...io.files.keys()].find(
      (k) => k.startsWith(BACKUP_V2) && k.endsWith('/project.json'),
    )
    expect(io.files.get(backup as string)).toBe(old)
  })

  it('a v3 manifest accepts a timeline trash entry', () => {
    const base = createManifest({ title: 'T', author: 'A', language: 'en' }, makeEnv())
    const entry = { ...trashed, id: 't-2', type: 'timeline' }
    expect(manifestSchema.safeParse({ ...base, trash: [entry] }).success).toBe(true)
  })

  it('a malformed v2 manifest is rejected and every file left untouched', async () => {
    const io = await v2Project()
    write(io, 'project.json', { ...json(io, 'project.json'), title: 5 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })

  it('a newer-than-current version still opens read-only and untouched', async () => {
    const io = await v2Project()
    write(io, 'project.json', { ...json(io, 'project.json'), version: MANIFEST_VERSION + 1 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.project.readOnly).toEqual({ reason: 'newer-version' })
    expect(io.files).toEqual(before)
  })
})
