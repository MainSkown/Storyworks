import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { migrations } from './migrations'
import { createProject, openProject } from './open'
import { manifestSchema, MANIFEST_VERSION } from './schemas/manifest'
import { sceneSchema, SCENE_VERSION } from './schemas/scene'
import { parseFile } from './serialize'
import type { Env } from './types'

const BACKUP_V8 = '.storyworks/backups/pre-migration-v8-'

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const json = (io: MemoryProjectIO, path: string) => JSON.parse(io.files.get(path) as string)
const write = (io: MemoryProjectIO, path: string, value: unknown) =>
  io.files.set(path, JSON.stringify(value, null, 2) + '\n')

const link = { id: 'l1', kind: 'codex', from: { item: 's-x', block: 'b1' }, to: { item: 'e-1' } }
const sceneV2 = (id: string, extra: Record<string, unknown> = {}) => ({
  version: 2,
  id,
  title: `Scene ${id}`,
  status: 'draft',
  synopsis: '',
  wordCount: 0,
  content: { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'b1' } }] },
  todos: [],
  comments: [],
  links: [link],
  ...extra,
})
const TRASH_PATH = '.storyworks/trash/s-t/s-t.json'
const trashed = {
  id: 's-t',
  type: 'scene',
  title: 'Trashed',
  originalPath: 'manuscript/s-t.json',
  trashPath: TRASH_PATH,
  parentId: null,
  index: 1,
  deletedAt: '2020-01-01T00:00:00.000Z',
}

/** v8 book with one live scene (v2 file) and one trashed scene (v2 file). */
async function v8Project(): Promise<{ io: MemoryProjectIO; scenePath: string }> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en' }, makeEnv())
  const scenePath = [...io.files.keys()].find((k) => k.startsWith('manuscript/')) as string
  const sceneId = json(io, scenePath).id as string
  write(io, scenePath, sceneV2(sceneId))
  write(io, TRASH_PATH, sceneV2('s-t'))
  write(io, 'project.json', {
    ...json(io, 'project.json'),
    version: 8,
    trash: [trashed],
  })
  return { io, scenePath }
}

describe('migration v8 to v9', () => {
  it('the step is registered, and versions are 9 and 3', () => {
    expect(migrations.find((m) => m.from === 8)?.to).toBe(9)
    expect(MANIFEST_VERSION).toBeGreaterThanOrEqual(9)
    expect(SCENE_VERSION).toBe(3)
  })

  it('opens a v8 project at the current version', async () => {
    const { io } = await v8Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.project.manifest.version).toBe(MANIFEST_VERSION)
  })

  it('migrates a live scene to version 3, content and links unchanged', async () => {
    const { io, scenePath } = await v8Project()
    const before = json(io, scenePath)
    await openProject(io, makeEnv())
    const r = parseFile(sceneSchema, io.files.get(scenePath) as string, 'p')
    expect(r.ok && r.value).toMatchObject({ version: 3, id: before.id, links: [link] })
    expect(json(io, scenePath)).toEqual({ ...before, version: 3 })
  })

  it('migrates a scene in the trash too', async () => {
    const { io } = await v8Project()
    await openProject(io, makeEnv())
    expect(json(io, TRASH_PATH)).toEqual({ ...sceneV2('s-t'), version: 3 })
  })

  it('writes a valid manifest', async () => {
    const { io } = await v8Project()
    await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
  })

  it('backs up the v8 project before writing', async () => {
    const { io, scenePath } = await v8Project()
    const old = io.files.get('project.json')
    await openProject(io, makeEnv())
    const backup = [...io.files.keys()].find(
      (k) => k.startsWith(BACKUP_V8) && k.endsWith('/project.json'),
    )
    expect(io.files.get(backup as string)).toBe(old)
    const scene = [...io.files.keys()].find(
      (k) => k.startsWith(BACKUP_V8) && k.endsWith(`/${scenePath}`),
    )
    expect(JSON.parse(io.files.get(scene as string) as string).version).toBe(2)
  })

  it('a missing scene file is left alone and the manifest still migrates', async () => {
    const { io, scenePath } = await v8Project()
    io.files.delete(scenePath)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    expect(io.files.has(scenePath)).toBe(false)
  })

  it('a hand-broken scene file stays byte-identical; the project opens', async () => {
    const { io, scenePath } = await v8Project()
    const broken = JSON.stringify({ ...sceneV2('x'), title: 5 })
    io.files.set(scenePath, broken)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    expect(io.files.get(scenePath)).toBe(broken)
    expect(json(io, 'project.json').version).toBe(MANIFEST_VERSION)
    expect(json(io, TRASH_PATH).version).toBe(3)
    if (r.status === 'ok') expect(r.issues.map((i) => i.kind)).toEqual(['invalid'])
  })

  it('a scene already at version 3 is not touched', async () => {
    const { io, scenePath } = await v8Project()
    const v3 = JSON.stringify({ ...sceneV2('x'), version: 3 })
    io.files.set(scenePath, v3)
    await openProject(io, makeEnv())
    expect(io.files.get(scenePath)).toBe(v3)
  })

  it('a newer-than-current version still opens read-only and untouched', async () => {
    const { io } = await v8Project()
    write(io, 'project.json', { ...json(io, 'project.json'), version: MANIFEST_VERSION + 1 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.project.readOnly).toEqual({ reason: 'newer-version' })
    expect(io.files).toEqual(before)
  })
})
