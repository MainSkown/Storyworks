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

const conv = (id: string, extra: Record<string, unknown> = {}) => ({
  version: 2,
  id,
  title: 'Talk',
  status: 'draft',
  synopsis: '',
  startNodeId: 'a',
  nodes: [
    { id: 'a', type: 'jump', x: 0, y: 0, sets: [], target: { nodeId: 'gone' } },
    {
      id: 'b',
      type: 'choice',
      x: 0,
      y: 0,
      sets: [],
      options: [{ id: 'o', text: 'Go', target: 'a', sets: [] }],
    },
  ],
  ...extra,
})
const node = (id: string) => ({ id, type: 'conversation', title: 'Talk', path: `manuscript/${id}.json`, children: [] })

/** v16 game project with one live conversation and one trashed one. */
async function v16Project(live: unknown = conv('c1')): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en', kind: 'game' }, makeEnv())
  const m = json(io, 'project.json')
  delete m.storyMap
  write(io, 'project.json', {
    ...m,
    version: 16,
    manuscript: [node('c1')],
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
  write(io, 'manuscript/c1.json', live)
  write(io, '.storyworks/trash/c2.json', conv('c2'))
  return io
}

describe('migration v16 to v17', () => {
  it('the step is registered, and the version is 17', () => {
    expect(migrations.find((m) => m.from === 16)?.to).toBe(17)
    expect(MANIFEST_VERSION).toBeGreaterThanOrEqual(17)
  })

  it('v2 conversations, live and trashed, become v3 with content unchanged', async () => {
    const io = await v16Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    const m = json(io, 'project.json')
    expect(m.version).toBe(MANIFEST_VERSION)
    expect(m.storyMap).toBeNull()
    for (const path of ['manuscript/c1.json', '.storyworks/trash/c2.json']) {
      const f = json(io, path)
      expect(f).toMatchObject({ version: 3, startNodeId: 'a' })
      expect(f.nodes).toEqual(conv('x').nodes)
      expect(parseFile(conversationSchema, io.files.get(path) as string, path).ok).toBe(true)
    }
  })

  it('the migrated project reopens without issues', async () => {
    const io = await v16Project()
    await openProject(io, makeEnv())
    const again = await openProject(io, makeEnv())
    expect(again.status === 'ok' && again.issues).toEqual([])
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
  })

  it('a malformed conversation file is left untouched and reported after opening', async () => {
    const io = await v16Project(conv('c1', { nodes: [{ junk: true }] }))
    const before = io.files.get('manuscript/c1.json')
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    expect(io.files.get('manuscript/c1.json')).toBe(before)
    expect(r.status === 'ok' && r.issues.some((i) => i.kind === 'invalid' && i.itemId === 'c1')).toBe(true)
  })

  it('a conversation that is not valid JSON stops the migration and changes nothing', async () => {
    const io = await v16Project()
    io.files.set('manuscript/c1.json', '{ nope')
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).not.toBe('ok')
    expect(io.files).toEqual(before)
  })
})

describe('route tags on tree nodes', () => {
  it('a tree node may carry route refs; a broken shape is rejected', async () => {
    const io = createMemoryProjectIO()
    await createProject(io, { title: 'T', author: 'A', language: 'en', kind: 'game' }, makeEnv())
    const m = json(io, 'project.json')
    const withRoutes = {
      ...m,
      manuscript: [{ ...node('c1'), routes: [{ timelineId: 't1', branchId: 'b1' }] }],
    }
    expect(manifestSchema.safeParse(withRoutes).success).toBe(true)
    const bad = { ...m, manuscript: [{ ...node('c1'), routes: [{ timelineId: 't1' }] }] }
    expect(manifestSchema.safeParse(bad).success).toBe(false)
  })
})
