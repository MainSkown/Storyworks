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

/** v14 project: no `lineCounter`, no `variables`. */
async function v14Project(
  kind: 'book' | 'screenplay' | 'game' = 'book',
  patch: Record<string, unknown> = {},
): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en', kind }, makeEnv())
  const rest = json(io, 'project.json')
  delete rest.lineCounter
  delete rest.variables
  write(io, 'project.json', { ...rest, version: 14, ...patch })
  return io
}

describe('migration v14 to v15', () => {
  it('the step is registered, and the version is 15', () => {
    expect(migrations.find((m) => m.from === 14)?.to).toBe(15)
    expect(MANIFEST_VERSION).toBeGreaterThanOrEqual(15)
  })

  it('adds a zero line counter and no variables file, keeping everything else', async () => {
    const io = await v14Project('game')
    const before = json(io, 'project.json')
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    const m = json(io, 'project.json')
    expect(m.version).toBe(MANIFEST_VERSION)
    expect(m.lineCounter).toBe(0)
    expect(m.variables).toBeNull()
    expect(m.title).toBe('Old')
    expect(m.manuscript).toEqual(before.manuscript)
  })

  it('the migrated manifest is valid and the book opens unchanged', async () => {
    const io = await v14Project()
    const r = await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    expect(r.status === 'ok' && r.project.readOnly).toBeNull()
  })

  it('keeps a pre-migration backup', async () => {
    const io = await v14Project()
    await openProject(io, makeEnv())
    expect([...io.files.keys()].some((k) => k.includes('backups/pre-migration-v14'))).toBe(true)
  })

  it('a malformed manifest is rejected and left untouched', async () => {
    const io = await v14Project('book', { title: 5 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })
})

describe('manifest v15 fields', () => {
  it('a new project starts with counter 0 and no variables file', async () => {
    const p = await createProject(
      createMemoryProjectIO(),
      { title: 'T', author: 'A', language: 'en', kind: 'game' },
      makeEnv(),
    )
    expect(p.manifest.lineCounter).toBe(0)
    expect(p.manifest.variables).toBeNull()
  })

  it('rejects a negative or fractional counter and a malformed variables ref', async () => {
    const p = await createProject(
      createMemoryProjectIO(),
      { title: 'T', author: 'A', language: 'en', kind: 'game' },
      makeEnv(),
    )
    for (const bad of [{ lineCounter: -1 }, { lineCounter: 1.5 }, { variables: 'variables.json' }]) {
      expect(parseFile(manifestSchema, JSON.stringify({ ...p.manifest, ...bad }), 'p').ok).toBe(false)
    }
  })

  it('accepts a conversation node and a conversation trash entry', async () => {
    const p = await createProject(
      createMemoryProjectIO(),
      { title: 'T', author: 'A', language: 'en', kind: 'game' },
      makeEnv(),
    )
    const ok = {
      ...p.manifest,
      manuscript: [
        {
          id: 'f',
          type: 'chapter',
          title: 'F',
          children: [{ id: 'c', type: 'conversation', title: 'C', path: 'manuscript/c.json', children: [] }],
        },
      ],
      trash: [
        {
          id: 'c2',
          type: 'conversation',
          title: 'C2',
          originalPath: 'manuscript/c2.json',
          trashPath: '.storyworks/trash/c2.json',
          parentId: null,
          index: 0,
          deletedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }
    expect(parseFile(manifestSchema, JSON.stringify(ok), 'p').ok).toBe(true)
  })
})
