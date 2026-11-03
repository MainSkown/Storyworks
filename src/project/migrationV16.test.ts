import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { migrations } from './migrations'
import { createProject, openProject } from './open'
import { conversationSchema } from './schemas/conversation'
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

const stub = (id: string) => ({
  version: 1,
  id,
  title: 'Talk',
  status: 'draft',
  synopsis: '',
  nodes: [],
})
const node = (id: string) => ({ id, type: 'conversation', title: 'Talk', path: `manuscript/${id}.json`, children: [] })

/** v15 game project with one live conversation (v1 stub), one trashed one and a missing one. */
async function v15Project(conv: unknown = stub('c1')): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en', kind: 'game' }, makeEnv())
  const m = json(io, 'project.json')
  write(io, 'project.json', {
    ...m,
    version: 15,
    manuscript: [node('c1'), node('gone')],
    trash: [
      {
        id: 'c2',
        type: 'conversation',
        title: 'Old talk',
        originalPath: 'manuscript/c2.json',
        trashPath: '.storyworks/trash/c2.json',
        parentId: null,
        index: 1,
        deletedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  })
  write(io, 'manuscript/c1.json', conv)
  write(io, '.storyworks/trash/c2.json', stub('c2'))
  return io
}

describe('migration v15 to v16', () => {
  it('the step is registered, and the version is 16', () => {
    expect(migrations.find((m) => m.from === 15)?.to).toBe(16)
    expect(MANIFEST_VERSION).toBeGreaterThanOrEqual(16)
  })

  it('a v1 stub conversation, live and trashed, becomes v2 with no start node', async () => {
    const io = await v15Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    expect(json(io, 'project.json').version).toBe(MANIFEST_VERSION)
    for (const path of ['manuscript/c1.json', '.storyworks/trash/c2.json']) {
      const f = json(io, path)
      expect(f).toMatchObject({ version: 3, startNodeId: null, nodes: [], title: expect.any(String) })
      expect(parseFile(conversationSchema, io.files.get(path) as string, path).ok).toBe(true)
    }
    expect(io.files.has('manuscript/gone.json')).toBe(false)
  })

  it('the migrated project reopens without issues', async () => {
    const io = await v15Project()
    await openProject(io, makeEnv())
    const again = await openProject(io, makeEnv())
    expect(again.status === 'ok' && again.issues.filter((i) => !('itemId' in i && i.itemId === 'gone'))).toEqual([])
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
  })

  it('keeps a pre-migration backup', async () => {
    const io = await v15Project()
    await openProject(io, makeEnv())
    expect([...io.files.keys()].some((k) => k.includes('backups/pre-migration-v15'))).toBe(true)
  })

  it('a malformed conversation file is left untouched and reported after opening', async () => {
    const bad = { ...stub('c1'), nodes: [{ junk: true }] }
    const io = await v15Project(bad)
    const before = io.files.get('manuscript/c1.json')
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    expect(io.files.get('manuscript/c1.json')).toBe(before)
    expect(r.status === 'ok' && r.issues.some((i) => i.kind === 'invalid' && i.itemId === 'c1')).toBe(true)
  })

  it('a conversation that is not valid JSON stops the migration and changes nothing', async () => {
    const io = await v15Project()
    io.files.set('manuscript/c1.json', '{ nope')
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })
})
