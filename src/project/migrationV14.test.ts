import { describe, expect, it } from 'vitest'
import { defaultScriptExportOptions } from '../export/scriptOptions'
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

/** v13 project: no `scriptExport`. */
async function v13Project(
  kind: 'book' | 'screenplay' = 'book',
  patch: Record<string, unknown> = {},
): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en', kind }, makeEnv())
  const rest = json(io, 'project.json')
  delete rest.scriptExport
  write(io, 'project.json', { ...rest, version: 13, ...patch })
  return io
}

describe('migration v13 to v14', () => {
  it('the step is registered, and the version is 14', () => {
    expect(migrations.find((m) => m.from === 13)?.to).toBe(14)
    expect(MANIFEST_VERSION).toBeGreaterThanOrEqual(14)
  })

  it('adds default script export settings and keeps everything else', async () => {
    const io = await v13Project('screenplay')
    const before = json(io, 'project.json')
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    const m = json(io, 'project.json')
    expect(m.version).toBe(MANIFEST_VERSION)
    expect(m.scriptExport).toEqual(defaultScriptExportOptions())
    expect(m.title).toBe('Old')
    expect(m.manuscript).toEqual(before.manuscript)
  })

  it('the migrated manifest is valid and the book opens unchanged', async () => {
    const io = await v13Project()
    const r = await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    expect(r.status === 'ok' && r.project.readOnly).toBeNull()
  })

  it('keeps a pre-migration backup', async () => {
    const io = await v13Project()
    await openProject(io, makeEnv())
    expect([...io.files.keys()].some((k) => k.includes('backups/pre-migration-v13'))).toBe(true)
  })

  it('a malformed manifest is rejected and left untouched', async () => {
    const io = await v13Project('book', { title: 5 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })

  it('rejects malformed script export settings', async () => {
    const io = createMemoryProjectIO()
    const p = await createProject(io, { title: 'T', author: 'A', language: 'en' }, makeEnv())
    const bad = { ...p.manifest, scriptExport: { ...defaultScriptExportOptions(), pageSize: 'A5' } }
    expect(parseFile(manifestSchema, JSON.stringify(bad), 'p').ok).toBe(false)
  })
})
