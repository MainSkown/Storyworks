import { describe, expect, it } from 'vitest'
import { defaultExportOptions } from '../export/options'
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

/** v10 book: manifest without `exportSettings`. */
async function v10Project(): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en' }, makeEnv())
  const rest = json(io, 'project.json')
  delete rest.exportSettings
  write(io, 'project.json', { ...rest, version: 10 })
  return io
}

describe('migration v10 to v11', () => {
  it('the step is registered, and the version is 11', () => {
    expect(migrations.find((m) => m.from === 10)?.to).toBe(11)
    expect(MANIFEST_VERSION).toBeGreaterThanOrEqual(11)
  })

  it('opens a v10 project at the current version with default exportSettings', async () => {
    const io = await v10Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.project.manifest.version).toBe(MANIFEST_VERSION)
      expect(r.project.manifest.exportSettings).toEqual(defaultExportOptions())
    }
    expect(json(io, 'project.json').exportSettings).toEqual(defaultExportOptions())
  })

  it('writes a valid manifest and leaves other files untouched', async () => {
    const io = await v10Project()
    const others = new Map([...io.files].filter(([k]) => k !== 'project.json'))
    await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    for (const [k, v] of others) {
      if (k.startsWith('.storyworks/')) continue
      expect(io.files.get(k)).toBe(v)
    }
  })

  it('a malformed manifest is rejected and left untouched', async () => {
    const io = await v10Project()
    write(io, 'project.json', { ...json(io, 'project.json'), title: 5 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })
})

describe('exportSettings schema', () => {
  const valid = (exportSettings: unknown) =>
    manifestSchema.safeParse({
      version: MANIFEST_VERSION,
      kind: 'book',
      title: 'T',
      author: 'A',
      language: 'en',
      createdAt: '2020-01-01T00:00:00.000Z',
      exportSettings,
    }).success
  const withOpts = (patch: Record<string, unknown>) => ({ ...defaultExportOptions(), ...patch })

  it('accepts the defaults, and a missing value gets them', () => {
    expect(valid(defaultExportOptions())).toBe(true)
    const m = manifestSchema.parse({
      version: MANIFEST_VERSION,
      kind: 'book',
      title: 'T',
      author: 'A',
      language: 'en',
      createdAt: '2020-01-01T00:00:00.000Z',
    })
    expect(m.exportSettings).toEqual(defaultExportOptions())
  })
  it('rejects out-of-range numbers', () => {
    expect(valid(withOpts({ fontSizePt: 5 }))).toBe(false)
    expect(valid(withOpts({ fontSizePt: 25 }))).toBe(false)
    expect(valid(withOpts({ lineSpacing: 0.5 }))).toBe(false)
    expect(valid(withOpts({ lineSpacing: 3.5 }))).toBe(false)
    expect(valid(withOpts({ marginMm: { top: -1, bottom: 0, left: 0, right: 0 } }))).toBe(false)
    expect(valid(withOpts({ marginMm: { top: 61, bottom: 0, left: 0, right: 0 } }))).toBe(false)
  })
  it('rejects unknown values and unknown keys', () => {
    expect(valid(withOpts({ pageSize: 'A3' }))).toBe(false)
    expect(valid(withOpts({ font: 'mono' }))).toBe(false)
    expect(valid(withOpts({ runningHeader: 'page' }))).toBe(false)
    expect(valid(withOpts({ extra: 1 }))).toBe(false)
  })
})
