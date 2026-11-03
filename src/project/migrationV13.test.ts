import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { migrations } from './migrations'
import { createProject, openProject } from './open'
import { manifestSchema, MANIFEST_VERSION } from './schemas/manifest'
import { parseFile } from './serialize'
import type { Env } from './types'

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const json = (io: MemoryProjectIO, path: string) => JSON.parse(io.files.get(path) as string)
const write = (io: MemoryProjectIO, path: string, value: unknown) =>
  io.files.set(path, JSON.stringify(value, null, 2) + '\n')

/** v12 book: no `titlePage`. */
async function v12Project(patch: Record<string, unknown> = {}): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en' }, makeEnv())
  const rest = json(io, 'project.json')
  delete rest.titlePage
  write(io, 'project.json', { ...rest, version: 12, ...patch })
  return io
}

describe('migration v12 to v13', () => {
  it('the step is registered, and the version is 13', () => {
    expect(migrations.find((m) => m.from === 12)?.to).toBe(13)
    expect(MANIFEST_VERSION).toBeGreaterThanOrEqual(13)
  })

  it('adds an empty title page and keeps everything else', async () => {
    const io = await v12Project()
    const before = json(io, 'project.json')
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    const m = json(io, 'project.json')
    expect(m.version).toBe(MANIFEST_VERSION)
    expect(m.titlePage).toEqual({ contact: '', date: '' })
    expect(m.title).toBe('Old')
    expect(m.manuscript).toEqual(before.manuscript)
  })

  it('the migrated manifest is valid and the book opens unchanged', async () => {
    const io = await v12Project()
    const r = await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    expect(r.status === 'ok' && r.project.readOnly).toBeNull()
  })

  it('keeps a pre-migration backup', async () => {
    const io = await v12Project()
    await openProject(io, makeEnv())
    expect([...io.files.keys()].some((k) => k.includes('backups/pre-migration-v12'))).toBe(true)
  })

  it('a malformed manifest is rejected and left untouched', async () => {
    const io = await v12Project({ title: 5 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })

  it('a malformed title page is rejected', () => {
    const base = parseFile(manifestSchema, '{}', 'p')
    expect(base.ok).toBe(false)
    const io = createMemoryProjectIO()
    return createProject(io, { title: 'T', author: 'A', language: 'en' }, makeEnv()).then((p) => {
      const bad = { ...p.manifest, titlePage: { contact: 1, date: '' } }
      expect(parseFile(manifestSchema, JSON.stringify(bad), 'p').ok).toBe(false)
    })
  })
})
