import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { migrations } from './migrations'
import { createProject, openProject } from './open'
import { MANIFEST_VERSION } from './schemas/manifest'
import type { Env } from './types'

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const json = (io: MemoryProjectIO, path: string) => JSON.parse(io.files.get(path) as string)
const write = (io: MemoryProjectIO, path: string, value: unknown) =>
  io.files.set(path, JSON.stringify(value, null, 2) + '\n')

/** A v17 game project: no game-document keys in the manifest. */
async function v17Project(): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en', kind: 'game' }, makeEnv())
  const m = json(io, 'project.json')
  for (const k of ['gameOverview', 'glossary', 'mechanics', 'mechanicCategories']) delete m[k]
  write(io, 'project.json', { ...m, version: 17 })
  return io
}

describe('migration v17 to v18', () => {
  it('the step is registered, and the version is 18', () => {
    expect(migrations.find((m) => m.from === 17)?.to).toBe(18)
    expect(MANIFEST_VERSION).toBeGreaterThanOrEqual(18)
  })

  it('adds empty game-document keys and keeps other files untouched', async () => {
    const io = await v17Project()
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    const m = json(io, 'project.json')
    expect(m).toMatchObject({
      version: MANIFEST_VERSION,
      gameOverview: null,
      glossary: null,
      mechanics: [],
      mechanicCategories: [],
    })
    for (const [path, text] of before) {
      if (path === 'project.json' || path.startsWith('.storyworks')) continue
      expect(io.files.get(path)).toBe(text)
    }
  })

  it('a book project migrates the same way', async () => {
    const io = createMemoryProjectIO()
    await createProject(io, { title: 'B', author: 'A', language: 'en' }, makeEnv())
    const m = json(io, 'project.json')
    for (const k of ['gameOverview', 'glossary', 'mechanics', 'mechanicCategories']) delete m[k]
    write(io, 'project.json', { ...m, version: 17 })
    expect((await openProject(io, makeEnv())).status).toBe('ok')
  })
})
