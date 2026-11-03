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

/** v11 book: dictionaries are plain names, no `stats`. */
async function v11Project(dictionaries: unknown = ['en_GB', 'my-terms']): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en' }, makeEnv())
  const rest = json(io, 'project.json')
  delete rest.stats
  write(io, 'project.json', { ...rest, version: 11, dictionaries })
  return io
}

describe('migration v11 to v12', () => {
  it('the step is registered, and the version is 12', () => {
    expect(migrations.find((m) => m.from === 11)?.to).toBe(12)
    expect(MANIFEST_VERSION).toBe(12)
  })

  it('turns dictionary names into global references and adds an empty stats slot', async () => {
    const io = await v11Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    const m = json(io, 'project.json')
    expect(m.version).toBe(12)
    expect(m.dictionaries).toEqual([
      { name: 'en_GB', scope: 'global' },
      { name: 'my-terms', scope: 'global' },
    ])
    expect(m.stats).toBeNull()
  })

  it('a book without dictionaries migrates to an empty list', async () => {
    const io = await v11Project([])
    await openProject(io, makeEnv())
    expect(json(io, 'project.json').dictionaries).toEqual([])
  })

  it('writes a valid manifest and leaves other files untouched', async () => {
    const io = await v11Project()
    const others = new Map([...io.files].filter(([k]) => k !== 'project.json'))
    await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    for (const [k, v] of others) {
      if (k.startsWith('.storyworks/')) continue
      expect(io.files.get(k)).toBe(v)
    }
  })

  it('keeps a pre-migration backup', async () => {
    const io = await v11Project()
    await openProject(io, makeEnv())
    expect([...io.files.keys()].some((k) => k.includes('backups/pre-migration-v11'))).toBe(true)
  })

  it('a malformed dictionary entry is rejected and the book is left untouched', async () => {
    const io = await v11Project([5])
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })
})
