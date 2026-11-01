import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { migrations } from './migrations'
import { createProject, openProject } from './open'
import { manifestSchema, MANIFEST_VERSION } from './schemas/manifest'
import { sceneSchema } from './schemas/scene'
import { parseFile } from './serialize'
import type { Env } from './types'

const BACKUPS = '.storyworks/backups/'

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const sceneOf = (io: MemoryProjectIO) =>
  [...io.files.keys()].find((k) => k.startsWith('manuscript/')) as string
const json = (io: MemoryProjectIO, path: string) => JSON.parse(io.files.get(path) as string)
const write = (io: MemoryProjectIO, path: string, value: unknown) =>
  io.files.set(path, JSON.stringify(value, null, 2) + '\n')

/** A v1 project: manifest and scene downgraded to the old shape (no todos, loose comments). */
async function v1Project(comments: unknown[] = []): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en' }, makeEnv())
  const scenePath = sceneOf(io)
  const scene = json(io, scenePath)
  delete scene.todos
  write(io, scenePath, { ...scene, version: 1, comments })
  write(io, 'project.json', { ...json(io, 'project.json'), version: 1 })
  return io
}

describe('migration v1 to v2', () => {
  it('is registered and the manifest version is 2', () => {
    expect(MANIFEST_VERSION).toBe(2)
    expect(migrations.find((m) => m.from === 1)?.to).toBe(2)
  })

  it('opens a v1 project as v2', async () => {
    const io = await v1Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.project.manifest.version).toBe(2)
  })

  it('writes files that validate against the v2 schemas', async () => {
    const io = await v1Project()
    await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    const path = sceneOf(io)
    expect(parseFile(sceneSchema, io.files.get(path) as string, path).ok).toBe(true)
  })

  it('gives scenes version 2 and empty todos', async () => {
    const io = await v1Project()
    await openProject(io, makeEnv())
    const scene = json(io, sceneOf(io))
    expect(scene.version).toBe(2)
    expect(scene.todos).toEqual([])
  })

  it('fills missing comment fields and keeps existing ones', async () => {
    const io = await v1Project([
      { id: 'c1' },
      { id: 'c2', text: 'hi', createdAt: '2020-01-01', resolved: true },
    ])
    await openProject(io, makeEnv())
    expect(json(io, sceneOf(io)).comments).toEqual([
      { id: 'c1', text: '', createdAt: '', resolved: false },
      { id: 'c2', text: 'hi', createdAt: '2020-01-01', resolved: true },
    ])
  })

  it('keeps scene content and title', async () => {
    const io = await v1Project()
    const before = json(io, sceneOf(io))
    await openProject(io, makeEnv())
    const after = json(io, sceneOf(io))
    expect(after.content).toEqual(before.content)
    expect(after.title).toBe(before.title)
  })

  it('backs up the v1 project before the first write', async () => {
    const io = await v1Project()
    const oldManifest = io.files.get('project.json')
    let backupAtFirstWrite: boolean | null = null
    io.failOn = (op, path) => {
      if (op === 'writeTextAtomic' && !path.startsWith(BACKUPS) && backupAtFirstWrite === null)
        backupAtFirstWrite = [...io.files.keys()].some((k) =>
          k.startsWith(`${BACKUPS}pre-migration-v1-`),
        )
      return false
    }
    await openProject(io, makeEnv())
    expect(backupAtFirstWrite).toBe(true)
    const backup = [...io.files.keys()].find(
      (k) => k.startsWith(`${BACKUPS}pre-migration-v1-`) && k.endsWith('/project.json'),
    )
    expect(io.files.get(backup as string)).toBe(oldManifest)
  })

  it('a malformed v1 scene leaves every file untouched', async () => {
    const io = await v1Project()
    const path = sceneOf(io)
    write(io, path, { ...json(io, path), title: 5 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('migration-failed')
    expect(io.files).toEqual(before)
  })
})
