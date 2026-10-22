import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import type { Migration } from './migrations'
import { openProject, createProject } from './open'
import { manifestSchema } from './schemas/manifest'
import { sceneSchema } from './schemas/scene'
import { parseFile } from './serialize'
import type { Env } from './types'

const BACKUPS = '.storyworks/backups/'
const BACKUP_V0 = `${BACKUPS}pre-migration-v0-`

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

/** v0 fixture: old files call the title field "name" and carry version 0. */
async function v0Project(): Promise<MemoryProjectIO> {
  const src = createMemoryProjectIO()
  await createProject(src, { title: 'Old Book', author: 'Ann', language: 'en' }, makeEnv())
  const out: Record<string, string> = {}
  for (const [path, text] of src.files) {
    if (path.startsWith('.storyworks/')) continue
    const { title, ...rest } = JSON.parse(text)
    out[path] = JSON.stringify({ ...rest, version: 0, name: title }, null, 2) + '\n'
  }
  return createMemoryProjectIO(out)
}

const rename: Migration = {
  from: 0,
  to: 1,
  migrate(files) {
    const out = new Map<string, unknown>()
    for (const [path, value] of files) {
      const { name, ...rest } = value as Record<string, unknown>
      out.set(path, { ...rest, version: 1, title: name })
    }
    return out
  },
}

const originals = (io: MemoryProjectIO) => new Map(io.files)

describe('migrations', () => {
  it('v0 fixture opens as v1', async () => {
    const io = await v0Project()
    const r = await openProject(io, makeEnv(), { migrations: [rename] })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.project.manifest.version).toBe(1)
      expect(r.project.manifest.title).toBe('Old Book')
      expect(r.project.readOnly).toBeNull()
      expect(r.issues).toEqual([])
    }
  })

  it('migrated files on disk validate against the current schemas', async () => {
    const io = await v0Project()
    const r = await openProject(io, makeEnv(), { migrations: [rename] })
    if (r.status !== 'ok') throw new Error('open failed')
    expect(
      parseFile(manifestSchema, io.files.get('project.json') as string, 'project.json').ok,
    ).toBe(true)
    const path = r.project.manifest.manuscript[0].children[0].path as string
    expect(parseFile(sceneSchema, io.files.get(path) as string, path).ok).toBe(true)
  })

  it('a migrated project opens again without running migrations', async () => {
    const io = await v0Project()
    await openProject(io, makeEnv(), { migrations: [rename] })
    const boom: Migration = {
      from: 0,
      to: 1,
      migrate() {
        throw new Error('should not run')
      },
    }
    const r = await openProject(io, makeEnv(), { migrations: [boom] })
    expect(r.status).toBe('ok')
  })

  it('backs up the old project before writing anything', async () => {
    const io = await v0Project()
    const old = io.files.get('project.json')
    let backupSeenAtFirstWrite: boolean | null = null
    io.failOn = (op, path) => {
      if (
        op === 'writeTextAtomic' &&
        !path.startsWith(BACKUPS) &&
        backupSeenAtFirstWrite === null
      ) {
        backupSeenAtFirstWrite = [...io.files.keys()].some((k) => k.startsWith(BACKUP_V0))
      }
      return false
    }
    await openProject(io, makeEnv(), { migrations: [rename] })
    expect(backupSeenAtFirstWrite).toBe(true)
    const backupManifest = [...io.files.keys()].find(
      (k) => k.startsWith(BACKUP_V0) && k.endsWith('/project.json'),
    )
    expect(backupManifest).toBeDefined()
    expect(io.files.get(backupManifest as string)).toBe(old)
  })

  it('a throwing step writes nothing and reports migration-failed', async () => {
    const io = await v0Project()
    const before = originals(io)
    const bad: Migration = {
      from: 0,
      to: 1,
      migrate() {
        throw new Error('boom')
      },
    }
    const r = await openProject(io, makeEnv(), { migrations: [bad] })
    expect(r.status).toBe('migration-failed')
    expect(io.files).toEqual(before)
  })

  it('a step whose output does not validate writes nothing', async () => {
    const io = await v0Project()
    const before = originals(io)
    const bad: Migration = {
      from: 0,
      to: 1,
      migrate(files) {
        const out = new Map<string, unknown>()
        for (const [p, v] of files) out.set(p, { ...(v as object), version: 1, title: 5 })
        return out
      },
    }
    const r = await openProject(io, makeEnv(), { migrations: [bad] })
    expect(r.status).toBe('migration-failed')
    expect(io.files).toEqual(before)
  })

  it('a write failure halfway restores the project from the backup', async () => {
    const io = await v0Project()
    const before = originals(io)
    let writes = 0
    io.failOn = (op, path) => {
      if (op !== 'writeTextAtomic' || path.startsWith(BACKUPS)) return false
      writes++
      return writes === 2
    }
    const r = await openProject(io, makeEnv(), { migrations: [rename] })
    expect(writes).toBeGreaterThanOrEqual(2)
    expect(r.status).toBe('migration-failed')
    for (const [path, text] of before) expect(io.files.get(path)).toBe(text)
  })
})
