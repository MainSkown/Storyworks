import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import { manifestSchema, type Manifest } from './schemas/manifest'
import { sceneSchema } from './schemas/scene'
import { parseFile, serialize } from './serialize'
import type { Env, OpenProject } from './types'

type Node = Manifest['manuscript'][number]

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const sceneFile = (id: string, title: string) =>
  serialize(sceneSchema, {
    version: 1,
    id,
    title,
    synopsis: '',
    content: { type: 'doc', content: [] },
    comments: [],
    links: [],
  } as never)

const node = (id: string, type: Node['type'], children: Node[] = []): Node =>
  ({
    id,
    type,
    title: id.toUpperCase(),
    path: type === 'scene' ? `manuscript/${id}.json` : undefined,
    children,
  }) as Node

/** Book with chapter "ch" holding scenes a, b, c and an empty chapter "ch2" holding scene x. */
async function seed(): Promise<{ io: MemoryProjectIO; project: OpenProject; env: Env }> {
  const io = createMemoryProjectIO()
  const env = makeEnv()
  const created = await createProject(io, { title: 'T', author: 'A', language: 'en' }, env)
  for (const id of ['a', 'b', 'c', 'x'])
    io.files.set(`manuscript/${id}.json`, sceneFile(id, id.toUpperCase()))
  created.manifest.manuscript = [
    node('ch', 'chapter', [node('a', 'scene'), node('b', 'scene'), node('c', 'scene')]),
    node('ch2', 'chapter', [node('x', 'scene')]),
  ]
  await created.saveManifest()
  const r = await openProject(io, env)
  if (r.status !== 'ok') throw new Error('open failed')
  return { io, project: r.project, env }
}

const ids = (nodes: Node[]) => nodes.map((n) => n.id)
const diskManifest = (io: MemoryProjectIO) => {
  const r = parseFile(manifestSchema, io.files.get('project.json') as string, 'project.json')
  if (!r.ok) throw new Error('manifest invalid')
  return r.value
}

describe('deleteItem', () => {
  it('moves the file to .storyworks/trash/<id>/', async () => {
    const { io, project } = await seed()
    const original = io.files.get('manuscript/b.json')
    const entry = await project.deleteItem('b')
    expect(io.files.has('manuscript/b.json')).toBe(false)
    expect(entry.trashPath.startsWith('.storyworks/trash/b/')).toBe(true)
    expect(io.files.get(entry.trashPath)).toBe(original)
  })

  it('records a TrashEntry in the manifest and removes the item from the tree', async () => {
    const { project } = await seed()
    const entry = await project.deleteItem('b')
    expect(entry).toMatchObject({
      id: 'b',
      type: 'scene',
      title: 'B',
      originalPath: 'manuscript/b.json',
      parentId: 'ch',
      index: 1,
    })
    expect(Number.isNaN(Date.parse(entry.deletedAt))).toBe(false)
    expect(project.manifest.trash).toEqual([entry])
    expect(ids(project.manifest.manuscript[0].children)).toEqual(['a', 'c'])
  })

  it('saves the manifest', async () => {
    const { io, project } = await seed()
    const entry = await project.deleteItem('b')
    const m = diskManifest(io)
    expect(m.trash).toEqual([entry])
    expect(ids(m.manuscript[0].children)).toEqual(['a', 'c'])
  })

  it('an unknown id is rejected', async () => {
    const { project } = await seed()
    await expect(project.deleteItem('nope')).rejects.toThrow()
  })

  it('a failure after the move rolls the move back', async () => {
    const { io, project } = await seed()
    const manifestText = io.files.get('project.json')
    const original = io.files.get('manuscript/b.json')
    io.failOn = (op, path) => op === 'writeTextAtomic' && path === 'project.json'
    await expect(project.deleteItem('b')).rejects.toThrow()
    expect(io.files.get('manuscript/b.json')).toBe(original)
    expect([...io.files.keys()].some((k) => k.startsWith('.storyworks/trash/'))).toBe(false)
    expect(io.files.get('project.json')).toBe(manifestText)
    expect(project.manifest.trash).toEqual([])
    expect(ids(project.manifest.manuscript[0].children)).toEqual(['a', 'b', 'c'])
  })
})

describe('restoreItem', () => {
  it('returns the file to its original path with the same id', async () => {
    const { io, project } = await seed()
    const original = io.files.get('manuscript/b.json')
    const entry = await project.deleteItem('b')
    await project.restoreItem('b')
    expect(io.files.get('manuscript/b.json')).toBe(original)
    expect(io.files.has(entry.trashPath)).toBe(false)
    const r = parseFile(sceneSchema, io.files.get('manuscript/b.json') as string, 'b.json')
    expect(r.ok && r.value.id).toBe('b')
  })

  it('puts it back at the original parent and index', async () => {
    const { project } = await seed()
    await project.deleteItem('b')
    await project.restoreItem('b')
    expect(ids(project.manifest.manuscript[0].children)).toEqual(['a', 'b', 'c'])
    expect(project.manifest.trash).toEqual([])
  })

  it('saves the manifest', async () => {
    const { io, project } = await seed()
    await project.deleteItem('b')
    await project.restoreItem('b')
    const m = diskManifest(io)
    expect(ids(m.manuscript[0].children)).toEqual(['a', 'b', 'c'])
    expect(m.trash).toEqual([])
  })

  it('goes to the root when the parent is gone', async () => {
    const { project } = await seed()
    await project.deleteItem('x')
    await project.deleteItem('ch2')
    await project.restoreItem('x')
    expect(ids(project.manifest.manuscript)).toContain('x')
    expect(project.manifest.trash.map((t) => t.id)).toEqual(['ch2'])
  })

  it('an id that is not in the trash is rejected', async () => {
    const { project } = await seed()
    await expect(project.restoreItem('a')).rejects.toThrow()
  })

  it('a failure after the move rolls the move back', async () => {
    const { io, project } = await seed()
    const entry = await project.deleteItem('b')
    const manifestText = io.files.get('project.json')
    io.failOn = (op, path) => op === 'writeTextAtomic' && path === 'project.json'
    await expect(project.restoreItem('b')).rejects.toThrow()
    expect(io.files.has('manuscript/b.json')).toBe(false)
    expect(io.files.has(entry.trashPath)).toBe(true)
    expect(io.files.get('project.json')).toBe(manifestText)
    expect(project.manifest.trash).toEqual([entry])
  })
})
