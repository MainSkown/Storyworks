import { describe, expect, it } from 'vitest'
import { KIND_IDS, kindProfile, nodeKindLabel } from './kinds'
import { createMemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import { manifestSchema } from './schemas/manifest'
import { parseFile } from './serialize'
import type { Env } from './types'

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const meta = { title: 'T', author: 'A', language: 'en' }

describe('project kinds', () => {
  it.each(KIND_IDS)('a new %s project is valid and reopens', async (kind) => {
    const io = createMemoryProjectIO()
    await createProject(io, { ...meta, kind }, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.project.readOnly).toBeNull()
      expect(r.project.manifest.kind).toBe(kind)
    }
  })

  it('no kind means book, with Chapter > Scene', async () => {
    const io = createMemoryProjectIO()
    const p = await createProject(io, meta, makeEnv())
    expect(p.manifest.kind).toBe('book')
    expect(p.manifest.manuscript[0]).toMatchObject({ type: 'chapter', title: 'Chapter 1' })
  })

  it('screenplay starts with one sequence holding one scene, in the book language', async () => {
    const en = await createProject(
      createMemoryProjectIO(),
      { ...meta, kind: 'screenplay' },
      makeEnv(),
    )
    expect(en.manifest.manuscript).toHaveLength(1)
    expect(en.manifest.manuscript[0]).toMatchObject({ type: 'chapter', title: 'Sequence 1' })
    expect(en.manifest.manuscript[0].children[0]).toMatchObject({ type: 'scene', title: 'Scene 1' })
    const pl = await createProject(
      createMemoryProjectIO(),
      { ...meta, language: 'pl', kind: 'screenplay' },
      makeEnv(),
    )
    expect(pl.manifest.manuscript[0].title).toBe('Sekwencja 1')
    expect(pl.manifest.manuscript[0].children[0].title).toBe('Scena 1')
  })

  it('screenplay scene file exists; game has an empty tree and no scene file', async () => {
    const sp = createMemoryProjectIO()
    const p = await createProject(sp, { ...meta, kind: 'screenplay' }, makeEnv())
    expect(sp.files.has(p.manifest.manuscript[0].children[0].path as string)).toBe(true)
    const g = createMemoryProjectIO()
    const gp = await createProject(g, { ...meta, kind: 'game' }, makeEnv())
    expect(gp.manifest.manuscript).toEqual([])
    expect([...g.files.keys()].filter((k) => k.startsWith('manuscript/'))).toEqual([])
  })

  it('refuses to create a project of an unknown kind', async () => {
    const io = createMemoryProjectIO()
    await expect(createProject(io, { ...meta, kind: 'opera' }, makeEnv())).rejects.toThrow()
    expect(io.files.size).toBe(0)
  })

  it('an unknown kind still opens read-only', async () => {
    const io = createMemoryProjectIO()
    await createProject(io, meta, makeEnv())
    const m = JSON.parse(io.files.get('project.json') as string)
    io.files.set('project.json', JSON.stringify({ ...m, kind: 'opera' }))
    const r = await openProject(io, makeEnv())
    expect(r.status === 'ok' && r.project.readOnly).toEqual({ reason: 'unknown-kind' })
  })

  it('saving a manifest whose kind was changed is rejected and nothing is written', async () => {
    const io = createMemoryProjectIO()
    const p = await createProject(io, { ...meta, kind: 'screenplay' }, makeEnv())
    const before = io.files.get('project.json')
    p.manifest.kind = 'book'
    await expect(p.saveManifest()).rejects.toThrow(/kind/)
    expect(io.files.get('project.json')).toBe(before)
  })

  it('profiles: book shows everything; the game hides Import only', () => {
    expect(kindProfile('book').hiddenSections).toEqual(['storymap', 'gamedoc'])
    expect(kindProfile('game').hiddenSections).not.toContain('storymap')
    expect(kindProfile('screenplay').hiddenSections).not.toContain('export')
    expect(kindProfile('game').hiddenSections).not.toContain('export')
    expect(kindProfile('book').hasImport).toBe(true)
    expect(kindProfile('screenplay').hasImport).toBe(true)
    expect(kindProfile('game').hasImport).toBe(false)
    expect(kindProfile('book').hasParts).toBe(true)
    expect(kindProfile('screenplay').hasParts).toBe(false)
    expect(kindProfile('screenplay').folderLabel).toBe('sequence')
    expect(kindProfile('game').folderLabel).toBe('folder')
    expect(kindProfile('game').nestedFolders).toBe(true)
    expect(kindProfile('book').nestedFolders).toBe(false)
    expect(kindProfile('screenplay').nestedFolders).toBe(false)
  })

  it('an unknown kind gets the book profile', () => {
    expect(kindProfile('opera').id).toBe('book')
  })
})

describe('node kind labels', () => {
  it('a screenplay calls its chapter-level folder a sequence; other kinds and levels are unchanged', () => {
    expect(nodeKindLabel('screenplay', 'chapter')).toBe('sequence')
    expect(nodeKindLabel('screenplay', 'scene')).toBe('scene')
    expect(nodeKindLabel('book', 'chapter')).toBe('chapter')
    expect(nodeKindLabel('book', 'part')).toBe('part')
    expect(nodeKindLabel('opera', 'chapter')).toBe('chapter')
  })

  it('a game calls folders folders and scenes scripts', () => {
    expect(nodeKindLabel('game', 'chapter')).toBe('folder')
    expect(nodeKindLabel('game', 'scene')).toBe('script')
    expect(nodeKindLabel('game', 'conversation')).toBe('conversation')
    expect(nodeKindLabel('book', 'scene')).toBe('scene')
  })
})
