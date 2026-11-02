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

/** v9 book: manifest without `checkSettings`. */
async function v9Project(): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en' }, makeEnv())
  const rest = json(io, 'project.json')
  delete rest.checkSettings
  write(io, 'project.json', { ...rest, version: 9 })
  return io
}

describe('migration v9 to v10', () => {
  it('the step is registered, and the version is 10', () => {
    expect(migrations.find((m) => m.from === 9)?.to).toBe(10)
    expect(MANIFEST_VERSION).toBeGreaterThanOrEqual(10)
  })

  it('opens a v9 project at the current version with empty checkSettings', async () => {
    const io = await v9Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.project.manifest.version).toBe(MANIFEST_VERSION)
      expect(r.project.manifest.checkSettings).toEqual({})
    }
    expect(json(io, 'project.json').checkSettings).toEqual({})
  })

  it('writes a valid manifest and leaves other files untouched', async () => {
    const io = await v9Project()
    const others = new Map([...io.files].filter(([k]) => k !== 'project.json'))
    await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    for (const [k, v] of others) {
      if (k.startsWith('.storyworks/')) continue
      expect(io.files.get(k)).toBe(v)
    }
  })

  it('a malformed manifest is rejected and left untouched', async () => {
    const io = await v9Project()
    write(io, 'project.json', { ...json(io, 'project.json'), title: 5 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })
})

describe('checkSettings schema', () => {
  const valid = (checkSettings: unknown) =>
    manifestSchema.safeParse({
      version: MANIFEST_VERSION,
      kind: 'book',
      title: 'T',
      author: 'A',
      language: 'en',
      createdAt: '2020-01-01T00:00:00.000Z',
      checkSettings,
    }).success

  it('accepts booleans', () => {
    expect(valid({ 'date-order': false, other: true })).toBe(true)
  })
  it('rejects non-boolean values', () => {
    expect(valid({ 'date-order': 'no' })).toBe(false)
    expect(valid({ 'date-order': 0 })).toBe(false)
  })
})
