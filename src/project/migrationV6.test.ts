import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { migrations } from './migrations'
import { createProject, openProject } from './open'
import { createManifest, manifestSchema, MANIFEST_VERSION } from './schemas/manifest'
import { parseFile } from './serialize'
import type { Env } from './types'

const BACKUP_V5 = '.storyworks/backups/pre-migration-v5-'

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const json = (io: MemoryProjectIO, path: string) => JSON.parse(io.files.get(path) as string)
const write = (io: MemoryProjectIO, path: string, value: unknown) =>
  io.files.set(path, JSON.stringify(value, null, 2) + '\n')

const trashed = {
  id: 'r-1',
  type: 'rule',
  title: 'Old rule',
  originalPath: 'rules/r-1.json',
  trashPath: '.storyworks/trash/r-1/r-1.json',
  parentId: null,
  index: 0,
  deletedAt: '2020-01-01T00:00:00.000Z',
}

async function v5Project(): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en' }, makeEnv())
  write(io, 'project.json', { ...json(io, 'project.json'), version: 5, trash: [trashed] })
  return io
}

describe('migration v5 to v6', () => {
  it('the step is registered', () => {
    expect(migrations.find((m) => m.from === 5)?.to).toBe(6)
  })

  it('opens a v5 project at the current version and keeps trash entries', async () => {
    const io = await v5Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.project.manifest.version).toBe(MANIFEST_VERSION)
      expect(r.project.manifest.trash).toEqual([trashed])
    }
  })

  it('writes a manifest that validates and leaves scenes unchanged', async () => {
    const io = await v5Project()
    const scenePath = [...io.files.keys()].find((k) => k.startsWith('manuscript/')) as string
    const before = io.files.get(scenePath)
    await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    expect(io.files.get(scenePath)).toBe(before)
  })

  it('backs up the v5 project before writing', async () => {
    const io = await v5Project()
    const old = io.files.get('project.json')
    await openProject(io, makeEnv())
    const backup = [...io.files.keys()].find(
      (k) => k.startsWith(BACKUP_V5) && k.endsWith('/project.json'),
    )
    expect(io.files.get(backup as string)).toBe(old)
  })

  it('the manifest accepts an entry trash entry', () => {
    const base = createManifest({ title: 'T', author: 'A', language: 'en' }, makeEnv())
    const entry = { ...trashed, id: 'e-1', type: 'entry', originalPath: 'codex/e-1.json' }
    expect(manifestSchema.safeParse({ ...base, trash: [entry] }).success).toBe(true)
  })

  it('a malformed v5 manifest is rejected and every file left untouched', async () => {
    const io = await v5Project()
    write(io, 'project.json', { ...json(io, 'project.json'), title: 5 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })

  it('a newer-than-current version still opens read-only and untouched', async () => {
    const io = await v5Project()
    write(io, 'project.json', { ...json(io, 'project.json'), version: MANIFEST_VERSION + 1 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.project.readOnly).toEqual({ reason: 'newer-version' })
    expect(io.files).toEqual(before)
  })
})
