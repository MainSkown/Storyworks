import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { sceneSchema, blockIds } from '../project/schemas/scene'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { listBackups } from '../history/backups'
import { applyImport } from './apply'
import { buildPlan, loadImport, type ImportFile, type ImportPlan, type Placement } from './plan'

let io: MemoryProjectIO
const enc = (s: string) => new TextEncoder().encode(s)
const file = (name: string, text: string, readAsset?: ImportFile['readAsset']): ImportFile => ({
  name, bytes: enc(text), readAsset,
})

beforeEach(() => {
  io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

async function opened() {
  setActivePinia(createPinia())
  const s = useProjectStore()
  await s.create('book', { title: 'B', author: 'A', language: 'en' })
  return s
}

function plan(files: ImportFile[], placement: Placement = { kind: 'end' }, edits?: { skipped?: string[] }): ImportPlan {
  const r = loadImport(files)
  if (!r.ok) throw new Error('load failed')
  return buildPlan(r.loaded, { rule: 'h1h2', placement, edits })
}

const MD = '# Alpha\n\none two\n\n## S1\n\nthree\n\n# Beta\n\nfour'
const titles = (s: ReturnType<typeof useProjectStore>) => s.tree.map((n) => n.title)

describe('applyImport', () => {
  it('appends chapters and scenes with content, word counts and block ids', async () => {
    const s = await opened()
    const files = [file('a.md', MD)]
    const r = await applyImport(s, plan(files), files)
    expect(titles(s)).toEqual(['Chapter 1', 'Alpha', 'Beta'])
    expect(r).toMatchObject({ chapters: 2, scenes: 3, words: 4 })
    const alpha = s.tree[1]!
    expect(alpha.children.map((c) => c.title)).toEqual(['Scene 1', 'S1'])
    const sc = sceneSchema.parse(JSON.parse(io.files.get(alpha.children[1]!.path!)!))
    expect(sc.wordCount).toBe(1)
    expect(blockIds(sc.content)).toHaveLength(1)
  })

  it('places the import after the selected chapter', async () => {
    const s = await opened()
    await s.addChapter(null, 'Second')
    const files = [file('a.md', MD)]
    await applyImport(s, plan(files, { kind: 'after', id: s.tree[0]!.id }), files)
    expect(titles(s)).toEqual(['Chapter 1', 'Alpha', 'Beta', 'Second'])
  })

  it('does not create skipped chapters or scenes', async () => {
    const s = await opened()
    const files = [file('a.md', MD)]
    const p = plan(files)
    const skip = [p.chapters[1]!.id, p.chapters[0]!.scenes[1]!.id]
    const r = await applyImport(s, plan(files, { kind: 'end' }, { skipped: skip }), files)
    expect(titles(s)).toEqual(['Chapter 1', 'Alpha'])
    expect(s.tree[1]!.children.map((c) => c.title)).toEqual(['Scene 1'])
    expect(r.scenes).toBe(1)
  })

  it('copies local images into assets/ and skips missing ones with a warning', async () => {
    const s = await opened()
    const readAsset = async (ref: string) => (ref === 'ok.png' ? new Uint8Array([1, 2, 3]) : null)
    const files = [file('a.md', '# A\n\n![](ok.png)\n\n![](gone.png)', readAsset)]
    const r = await applyImport(s, plan(files), files)
    const scene = JSON.parse(io.files.get(s.tree[1]!.children[0]!.path!)!)
    const images = scene.content.content.filter((n: { type: string }) => n.type === 'image')
    expect(images).toHaveLength(1)
    expect(images[0].attrs.src).toMatch(/^assets\/.+\.png$/)
    expect(io.files.has(images[0].attrs.src)).toBe(true)
    expect(r.warnings).toEqual([{ code: 'missing-image', file: 'a.md', ref: 'gone.png' }])
  })

  it('makes a backup before creating anything', async () => {
    const s = await opened()
    const files = [file('a.md', MD)]
    const r = await applyImport(s, plan(files), files)
    expect((await listBackups(io)).map((b) => b.name)).toContain(r.backup)
  })

  it('does not count imported words as writing progress', async () => {
    const s = await opened()
    const files = [file('a.md', MD)]
    await applyImport(s, plan(files), files)
    expect(s.stats?.days ?? []).toEqual([])
  })
})
