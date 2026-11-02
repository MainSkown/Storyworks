import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryFileIO } from '../io/fileIO'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { useHistoryStore } from './store'

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

async function opened() {
  setActivePinia(createPinia())
  const p = useProjectStore()
  expect(await p.create('book', META)).toBe('opened')
  const chapter = p.tree[0].id
  const first = p.tree[0].children[0].id
  const second = await p.addScene(chapter, 'Two')
  const third = await p.addScene(chapter, 'Three')
  await p.flush()
  const h = useHistoryStore()
  await h.refresh()
  return { p, h, ids: [first, second, third] }
}

const edit = async (p: ReturnType<typeof useProjectStore>, ids: string[], text: string) => {
  for (const id of ids) {
    const content = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: `b-${id}` }, content: [{ type: 'text', text }] }] }
    await p.setSceneContent(id, content as never, 1)
  }
  await p.flush()
}

describe('history store', () => {
  it('lists everything before the first snapshot, then nothing after Snapshot all', async () => {
    const { h } = await opened()
    expect(h.changeCount).toBeGreaterThan(0)
    await h.snapshotAll('first')
    expect(h.changeCount).toBe(0)
    expect(h.snapshots.map((s) => s.message)).toEqual(['first'])
  })

  it('snapshots only the ticked scenes and keeps the other listed', async () => {
    const { p, h, ids } = await opened()
    await h.snapshotAll()
    await edit(p, ids, 'v2')
    await h.refresh()
    expect(h.items.map((i) => i.key).sort()).toEqual(ids.map((i) => `node:${i}`).sort())
    h.toggle(`node:${ids[2]}`)
    expect(h.selected.has(`node:${ids[2]}`)).toBe(false)
    await h.snapshot('two of three')
    expect(h.items.map((i) => i.key)).toEqual([`node:${ids[2]}`])
    expect(h.selected.has(`node:${ids[2]}`)).toBe(false)
  })

  it('selectNone then selectAll toggles every item', async () => {
    const { p, h, ids } = await opened()
    await h.snapshotAll()
    await edit(p, ids, 'v2')
    await h.refresh()
    h.selectNone()
    expect(h.selected.size).toBe(0)
    h.selectAll()
    expect(h.selected.size).toBe(ids.length)
  })

  it('restoreItem returns the snapshot text and reloads', async () => {
    const { p, h, ids } = await opened()
    await h.snapshotAll()
    const id = (await (async () => h.snapshots[0].id)())
    await edit(p, [ids[1]], 'changed')
    expect(await h.itemNow(`node:${ids[1]}`)).toContain('changed')
    expect(await h.itemAsOf(id, `node:${ids[1]}`)).not.toContain('changed')
    await h.restoreItem(id, `node:${ids[1]}`)
    expect(io.files.get(`manuscript/${ids[1]}.json`)).not.toContain('changed')
    await h.refresh()
    expect(h.changeCount).toBe(0)
    expect(h.backups.some((b) => b.kind === 'safety')).toBe(true)
  })

  it('diffItem compares a snapshot with the current text', async () => {
    const { p, h, ids } = await opened()
    await h.snapshotAll()
    await edit(p, [ids[0]], 'changed')
    const lines = await h.diffItem(h.snapshots[0].id, `node:${ids[0]}`, 'current')
    expect(lines).not.toBeNull()
  })

  it('snapshotChangesOf lists one snapshot and previousOf finds the one before', async () => {
    const { p, h, ids } = await opened()
    await h.snapshotAll()
    await edit(p, [ids[0]], 'v2')
    await h.refresh()
    await h.snapshotAll()
    const [latest, first] = h.snapshots
    expect(h.previousOf(latest.id)).toBe(first.id)
    expect(h.previousOf(first.id)).toBeNull()
    expect((await h.snapshotChangesOf(latest.id)).map((i) => i.key)).toEqual([`node:${ids[0]}`])
  })

  it('refuses snapshots and restores when the book is read-only', async () => {
    const { p, h } = await opened()
    await h.snapshotAll()
    const id = h.snapshots[0].id
    const pw = p as unknown as { project: { readOnly: unknown } }
    pw.project = { ...p.project!, readOnly: { reason: 'locked-elsewhere' } } as never
    await expect(h.restoreProject(id)).rejects.toMatchObject({ code: 'read-only' })
    await expect(h.snapshotAll()).rejects.toMatchObject({ code: 'read-only' })
  })

  it('a broken history sets error; startNewHistory recovers', async () => {
    const { h } = await opened()
    await h.snapshotAll()
    h.breakEngineForTest()
    await h.refresh()
    expect(h.error?.code).toBe('corrupt')
    expect(h.items).toEqual([])
    expect(h.snapshots).toEqual([])
    expect(h.changeCount).toBe(0)
    await h.startNewHistory()
    expect(h.error).toBeNull()
    expect(h.snapshots).toEqual([])
    expect(h.changeCount).toBeGreaterThan(0)
  })
})
