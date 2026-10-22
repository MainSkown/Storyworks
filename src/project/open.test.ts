import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import { createManifest, manifestSchema, type Manifest } from './schemas/manifest'
import { sceneSchema, type Scene } from './schemas/scene'
import { parseFile, serialize } from './serialize'
import type { Env, OpenProject } from './types'

const META = { title: 'My Book', author: 'Ann', language: 'en' }

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

async function newBook(): Promise<{ io: MemoryProjectIO; project: OpenProject; env: Env }> {
  const io = createMemoryProjectIO()
  const env = makeEnv()
  const project = await createProject(io, META, env)
  return { io, project, env }
}

const sceneNode = (m: Manifest) => m.manuscript[0].children[0]
const scenePathOf = (m: Manifest) => sceneNode(m).path as string

async function openOk(io: MemoryProjectIO, env: Env) {
  const r = await openProject(io, env)
  if (r.status !== 'ok') throw new Error(`open failed: ${r.status}`)
  return r
}

function loadScene(io: MemoryProjectIO, path: string): Scene {
  const r = parseFile(sceneSchema, io.files.get(path) as string, path)
  if (!r.ok) throw new Error('scene invalid')
  return r.value
}

function snapshot(io: MemoryProjectIO) {
  return new Map(io.files)
}

describe('createProject', () => {
  it('writes the manifest, Chapter 1 and one scene', async () => {
    const { io, project } = await newBook()
    const m = project.manifest
    expect(io.files.has('project.json')).toBe(true)
    expect(m.title).toBe('My Book')
    expect(m.manuscript).toHaveLength(1)
    expect(m.manuscript[0]).toMatchObject({ type: 'chapter', title: 'Chapter 1' })
    expect(m.manuscript[0].children).toHaveLength(1)
    expect(sceneNode(m).type).toBe('scene')
    expect(io.files.has(scenePathOf(m))).toBe(true)
  })
  it('the scene file matches the manifest id and validates', async () => {
    const { io, project } = await newBook()
    expect(loadScene(io, scenePathOf(project.manifest)).id).toBe(sceneNode(project.manifest).id)
  })
  it('the manifest on disk is the serialized manifest', async () => {
    const { io, project } = await newBook()
    expect(io.files.get('project.json')).toBe(serialize(manifestSchema, project.manifest))
  })
})

describe('openProject', () => {
  it('reopens a new book identically, with no issues and no writes', async () => {
    const { io, project, env } = await newBook()
    const before = snapshot(io)
    const r = await openOk(io, env)
    expect(r.issues).toEqual([])
    expect(r.project.manifest).toEqual(project.manifest)
    expect(r.project.readOnly).toBeNull()
    expect(io.files).toEqual(before)
  })

  it('missing item file: opens, reports missing', async () => {
    const { io, env, project } = await newBook()
    const path = scenePathOf(project.manifest)
    io.files.delete(path)
    const r = await openOk(io, env)
    expect(r.issues).toEqual([{ kind: 'missing', itemId: sceneNode(project.manifest).id, path }])
  })

  it('invalid item: opens, reports field error, bytes untouched', async () => {
    const { io, env, project } = await newBook()
    const path = scenePathOf(project.manifest)
    const bad = JSON.stringify({ ...loadScene(io, path), title: 5 })
    io.files.set(path, bad)
    const r = await openOk(io, env)
    expect(r.issues).toHaveLength(1)
    const issue = r.issues[0]
    expect(issue.kind).toBe('invalid')
    if (issue.kind === 'invalid') {
      expect(issue.path).toBe(path)
      expect(issue.error.file).toBe(path)
      expect(issue.error.field).toBe('title')
    }
    expect(r.project.isInvalid(path)).toBe(true)
    expect(io.files.get(path)).toBe(bad)
  })

  it('saveItem refuses an item that was invalid on open', async () => {
    const { io, env, project } = await newBook()
    const path = scenePathOf(project.manifest)
    const good = loadScene(io, path)
    const bad = JSON.stringify({ ...good, title: 5 })
    io.files.set(path, bad)
    const { project: p } = await openOk(io, env)
    await expect(p.saveItem(path, sceneSchema, { ...good, title: 'Fixed' })).rejects.toThrow()
    expect(io.files.get(path)).toBe(bad)
  })

  it('invalid JSON manifest is refused and left untouched', async () => {
    const io = createMemoryProjectIO({ 'project.json': '{ nope' })
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('refused')
    if (r.status === 'refused') {
      expect(r.reason).toBe('invalid-json')
      expect(r.error.file).toBe('project.json')
    }
    expect(io.files.get('project.json')).toBe('{ nope')
  })

  it('manifest that breaks the schema is refused with the field', async () => {
    const m = createManifest(META, makeEnv())
    const text = JSON.stringify({ ...m, title: 5 })
    const io = createMemoryProjectIO({ 'project.json': text })
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('refused')
    if (r.status === 'refused') {
      expect(r.reason).toBe('invalid-schema')
      expect(r.error.field).toBe('title')
    }
    expect(io.files.get('project.json')).toBe(text)
  })

  it('a project folder without project.json is refused', async () => {
    const r = await openProject(createMemoryProjectIO(), makeEnv())
    expect(r.status).toBe('refused')
  })

  it('unlisted file: reported, not deleted', async () => {
    const { io, env, project } = await newBook()
    const dir = scenePathOf(project.manifest).split('/').slice(0, -1).join('/')
    const stray = `${dir ? dir + '/' : ''}stray.json`
    io.files.set(stray, '{}')
    const r = await openOk(io, env)
    expect(r.issues).toEqual([{ kind: 'unlisted', path: stray }])
    expect(io.files.get(stray)).toBe('{}')
  })

  it('internal .storyworks files are not reported as unlisted', async () => {
    const { io, env } = await newBook()
    io.files.set('.storyworks/project.lock', '{}')
    expect((await openOk(io, env)).issues).toEqual([])
  })

  it('newer version: read-only, saves refused, files untouched', async () => {
    const { io, env, project } = await newBook()
    const text = JSON.stringify({ ...project.manifest, version: 99 })
    io.files.set('project.json', text)
    const before = snapshot(io)
    const r = await openOk(io, env)
    expect(r.project.readOnly).toEqual({ reason: 'newer-version' })
    const path = scenePathOf(project.manifest)
    await expect(
      r.project.saveItem(path, sceneSchema, { ...loadScene(io, path), title: 'X' }),
    ).rejects.toThrow()
    await expect(r.project.saveManifest()).rejects.toThrow()
    expect(io.files).toEqual(before)
  })

  it('unknown kind: read-only', async () => {
    const { io, env, project } = await newBook()
    io.files.set('project.json', JSON.stringify({ ...project.manifest, kind: 'game-x' }))
    const r = await openOk(io, env)
    expect(r.project.readOnly).toEqual({ reason: 'unknown-kind' })
    await expect(r.project.saveManifest()).rejects.toThrow()
  })

  it('known kind book is not read-only', async () => {
    const { io, env } = await newBook()
    expect((await openOk(io, env)).project.readOnly).toBeNull()
  })
})

describe('saveItem / saveManifest', () => {
  it('writes a changed item and updates the known hash', async () => {
    const { io, env, project } = await newBook()
    const path = scenePathOf(project.manifest)
    const { project: p } = await openOk(io, env)
    const scene = loadScene(io, path)
    const hashBefore = p.knownHash(path)
    await p.saveItem(path, sceneSchema, { ...scene, title: 'Renamed' })
    expect(loadScene(io, path).title).toBe('Renamed')
    expect(io.files.get(path)).toBe(serialize(sceneSchema, { ...scene, title: 'Renamed' }))
    expect(p.knownHash(path)).toBeDefined()
    expect(p.knownHash(path)).not.toBe(hashBefore)
  })

  it('validates before touching disk', async () => {
    const { io, env, project } = await newBook()
    const path = scenePathOf(project.manifest)
    const { project: p } = await openOk(io, env)
    const scene = loadScene(io, path)
    const before = snapshot(io)
    const ops: string[] = []
    io.failOn = (op) => {
      ops.push(op)
      return false
    }
    await expect(
      p.saveItem(path, sceneSchema, { ...scene, title: 5 as unknown as string }),
    ).rejects.toThrow()
    expect(ops).not.toContain('writeTextAtomic')
    expect(io.files).toEqual(before)
  })

  it('saving unchanged data writes nothing', async () => {
    const { io, env, project } = await newBook()
    const path = scenePathOf(project.manifest)
    const { project: p } = await openOk(io, env)
    const scene = loadScene(io, path)
    let writes = 0
    io.failOn = (op) => {
      if (op === 'writeTextAtomic') writes++
      return false
    }
    await p.saveItem(path, sceneSchema, scene)
    expect(writes).toBe(0)
    await p.saveItem(path, sceneSchema, { ...scene, title: 'New' })
    expect(writes).toBe(1)
    await p.saveItem(path, sceneSchema, { ...scene, title: 'New' })
    expect(writes).toBe(1)
  })

  it('a failed write leaves the old file and hash intact', async () => {
    const { io, env, project } = await newBook()
    const path = scenePathOf(project.manifest)
    const { project: p } = await openOk(io, env)
    const scene = loadScene(io, path)
    const old = io.files.get(path)
    const hash = p.knownHash(path)
    io.failOn = (op, target) => op === 'writeTextAtomic' && target === path
    await expect(p.saveItem(path, sceneSchema, { ...scene, title: 'New' })).rejects.toThrow()
    expect(io.files.get(path)).toBe(old)
    expect(p.knownHash(path)).toBe(hash)
  })

  it('saveManifest writes the serialized manifest', async () => {
    const { io, env } = await newBook()
    const { project: p } = await openOk(io, env)
    p.manifest.title = 'Renamed Book'
    await p.saveManifest()
    expect(io.files.get('project.json')).toBe(serialize(manifestSchema, p.manifest))
  })

  it('saveManifest refuses an invalid manifest without writing', async () => {
    const { io, env } = await newBook()
    const { project: p } = await openOk(io, env)
    const before = io.files.get('project.json')
    p.manifest.title = 5 as unknown as string
    await expect(p.saveManifest()).rejects.toThrow()
    expect(io.files.get('project.json')).toBe(before)
  })
})
