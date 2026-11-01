import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { CODEX_KIND } from '../project/links'
import { ignoredSchema } from '../project/schemas/ignored'
import { sceneSchema } from '../project/schemas/scene'
import { parseFile } from '../project/serialize'
import { useCodexStore } from './store'
import {
  ignoreMention,
  linkMention,
  linkMentions,
  scanMentions,
  unignoreMention,
} from './mentionActions'

const META = { title: 'My Book', author: 'Ann', language: 'en' }
let io: MemoryProjectIO

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

const p = (id: string, text: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
})

async function setup() {
  setActivePinia(createPinia())
  const s = useProjectStore()
  expect(await s.create('book', META)).toBe('opened')
  const c = useCodexStore()
  const entryId = (await c.createEntry({ name: 'Anna' })) as string
  c.updateEntry(entryId, { aliases: ['Ania'] })
  const scene = s.tree[0].children[0]
  await s.setSceneContent(
    scene.id,
    { type: 'doc', content: [p('b1', 'Anna came in.'), p('b2', 'Ania left.'), p('b3', 'Nobody.')] },
    7,
  )
  return { s, c, entryId, sceneId: scene.id, path: scene.path as string }
}

const sceneOnDisk = (path: string) => {
  const r = parseFile(sceneSchema, io.files.get(path) as string, path)
  if (!r.ok) throw new Error('scene invalid on disk')
  return r.value
}
const ignoredOnDisk = () => {
  const text = io.files.get('ignored.json')
  if (text === undefined) return null
  const r = parseFile(ignoredSchema, text, 'ignored.json')
  if (!r.ok) throw new Error('ignored invalid on disk')
  return r.value
}
const manifest = () => JSON.parse(io.files.get('project.json') as string)

describe('scanning', () => {
  it('finds unlinked mentions in saved and unsaved scene text', async () => {
    const { entryId, c } = await setup()
    const entry = c.entries.find((e) => e.id === entryId)!
    const found = await scanMentions(entry)
    expect(found.map((m) => m.blockId)).toEqual(['b1', 'b2'])
  })
})

describe('linking', () => {
  it('link one writes a codex link to the scene file and the mention disappears', async () => {
    const { s, c, entryId, sceneId, path } = await setup()
    const entry = c.entries.find((e) => e.id === entryId)!
    const [m1] = await scanMentions(entry)
    expect(await linkMention(m1)).toEqual({ ok: true, added: 1, skipped: 0 })
    await s.flush()
    expect(sceneOnDisk(path).links).toEqual([
      expect.objectContaining({
        kind: CODEX_KIND,
        from: { item: sceneId, block: 'b1' },
        to: { item: entryId },
      }),
    ])
    expect((await scanMentions(entry)).map((m) => m.blockId)).toEqual(['b2'])
    expect(s.linkIndex()?.linksTo({ item: entryId })).toHaveLength(1)
  })

  it('link all adds one link per mention and a second run adds none', async () => {
    const { s, c, entryId, path } = await setup()
    const entry = c.entries.find((e) => e.id === entryId)!
    const found = await scanMentions(entry)
    expect(await linkMentions(found)).toEqual({ ok: true, added: 2, skipped: 0 })
    expect(await linkMentions(found)).toEqual({ ok: true, added: 0, skipped: 2 })
    await s.flush()
    expect(sceneOnDisk(path).links).toHaveLength(2)
    expect(await scanMentions(entry)).toEqual([])
  })

  it('refuses a mention whose block is gone or entry is not listed, and adds nothing', async () => {
    const { s, c, entryId, sceneId, path } = await setup()
    const entry = c.entries.find((e) => e.id === entryId)!
    const [m1] = await scanMentions(entry)
    const stale = { ...m1, blockId: 'gone', id: 'mention:x:gone' }
    expect(await linkMentions([stale])).toEqual({ ok: true, added: 0, skipped: 1 })
    const noEntry = { ...m1, entryId: 'nope' }
    expect(await linkMention(noEntry)).toEqual({ ok: false, reason: 'unknown-entry' })
    await s.flush()
    expect(sceneOnDisk(path).links).toEqual([])
    expect(sceneId).toBeTruthy()
  })

  it('does nothing when read-only', async () => {
    const { s, c, entryId } = await setup()
    const entry = c.entries.find((e) => e.id === entryId)!
    const found = await scanMentions(entry)
    await s.flush()
    await s.close()
    const m = manifest()
    io.files.set('project.json', JSON.stringify({ ...m, kind: 'other' }))
    await s.open('book')
    expect(await linkMentions(found)).toEqual({ ok: false, reason: 'read-only' })
    expect(await ignoreMention(found[0])).toEqual({ ok: false, reason: 'read-only' })
  })
})

describe('ignoring', () => {
  it('ignore writes ignored.json atomically, registers it in the manifest and hides the mention', async () => {
    const { s, c, entryId } = await setup()
    const entry = c.entries.find((e) => e.id === entryId)!
    const [m1] = await scanMentions(entry)
    expect(manifest().ignoredFindings).toBeNull()
    expect(await ignoreMention(m1)).toEqual({ ok: true })
    await s.flush()
    expect(ignoredOnDisk()).toEqual({ version: 1, ignored: [{ id: `mention:${entryId}:b1` }] })
    expect(manifest().ignoredFindings).toMatchObject({ path: 'ignored.json' })
    expect((await scanMentions(entry)).map((m) => m.blockId)).toEqual(['b2'])
  })

  it('ignoring twice keeps one entry; un-ignore brings the mention back', async () => {
    const { s, c, entryId } = await setup()
    const entry = c.entries.find((e) => e.id === entryId)!
    const [m1] = await scanMentions(entry)
    await ignoreMention(m1)
    await ignoreMention(m1)
    await s.flush()
    expect(ignoredOnDisk()?.ignored).toHaveLength(1)
    expect(await unignoreMention(m1)).toEqual({ ok: true })
    await s.flush()
    expect(ignoredOnDisk()?.ignored).toEqual([])
    expect(await scanMentions(entry)).toHaveLength(2)
  })

  it('the ignored list survives closing and reopening', async () => {
    const { s, c, entryId } = await setup()
    const entry = c.entries.find((e) => e.id === entryId)!
    const [m1] = await scanMentions(entry)
    await ignoreMention(m1)
    await s.flush()
    await s.close()
    await s.open('book')
    expect(s.ignoredIds.has(m1.id)).toBe(true)
  })

  it('an invalid ignored file is flagged, refused and left untouched', async () => {
    const { s, c, entryId } = await setup()
    const entry = c.entries.find((e) => e.id === entryId)!
    const [m1] = await scanMentions(entry)
    await ignoreMention(m1)
    await s.flush()
    await s.close()
    const bad = '{"version":1,"ignored":[{"id":5}]}'
    io.files.set('ignored.json', bad)
    await s.open('book')
    expect(s.ignoredInvalid).toBe(true)
    expect(s.issues.some((i) => i.kind === 'invalid' && i.path === 'ignored.json')).toBe(true)
    expect(await ignoreMention(m1)).toEqual({ ok: false, reason: 'failed' })
    await s.flush()
    expect(io.files.get('ignored.json')).toBe(bad)
  })

  it('no ignored.json exists until something is ignored', async () => {
    const { s } = await setup()
    await s.flush()
    expect(io.files.has('ignored.json')).toBe(false)
  })
})
