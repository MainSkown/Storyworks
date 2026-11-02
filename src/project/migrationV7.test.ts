import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { migrations } from './migrations'
import { createProject, openProject } from './open'
import { manifestSchema, MANIFEST_VERSION } from './schemas/manifest'
import { parseFile } from './serialize'
import type { Env } from './types'

const BACKUP_V6 = '.storyworks/backups/pre-migration-v6-'

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const json = (io: MemoryProjectIO, path: string) => JSON.parse(io.files.get(path) as string)
const write = (io: MemoryProjectIO, path: string, value: unknown) =>
  io.files.set(path, JSON.stringify(value, null, 2) + '\n')

async function v6Project(): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en' }, makeEnv())
  const old = json(io, 'project.json')
  delete old.relationLayout
  write(io, 'project.json', { ...old, version: 6 })
  return io
}

describe('migration v6 to v7', () => {
  it('manifest version is 7 and the step is registered', () => {
    expect(MANIFEST_VERSION).toBe(7)
    expect(migrations.find((m) => m.from === 6)?.to).toBe(7)
  })

  it('opens a v6 project as v7 with no layout file', async () => {
    const io = await v6Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.project.manifest.version).toBe(7)
      expect(r.project.manifest.relationLayout).toBeNull()
    }
  })

  it('writes a manifest that validates and leaves scenes unchanged', async () => {
    const io = await v6Project()
    const scenePath = [...io.files.keys()].find((k) => k.startsWith('manuscript/')) as string
    const before = io.files.get(scenePath)
    await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    expect(io.files.get(scenePath)).toBe(before)
  })

  it('backs up the v6 project before writing', async () => {
    const io = await v6Project()
    const old = io.files.get('project.json')
    await openProject(io, makeEnv())
    const backup = [...io.files.keys()].find(
      (k) => k.startsWith(BACKUP_V6) && k.endsWith('/project.json'),
    )
    expect(io.files.get(backup as string)).toBe(old)
  })

  it('a malformed v6 manifest is rejected and every file left untouched', async () => {
    const io = await v6Project()
    write(io, 'project.json', { ...json(io, 'project.json'), title: 5 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })

  it('a newer-than-current version still opens read-only and untouched', async () => {
    const io = await v6Project()
    write(io, 'project.json', { ...json(io, 'project.json'), version: MANIFEST_VERSION + 1 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.project.readOnly).toEqual({ reason: 'newer-version' })
    expect(io.files).toEqual(before)
  })
})
