import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { LOCK_PATH } from '../project/lock'
import { useCodexStore } from '../codex/store'
import {
  blockLinkInfoMap,
  linkSelectionToEntry,
  linkSelectionToNode,
  linksForBlock,
  relinkLinkToEntry,
  unlinkLink,
} from './eventLinks'

let io: MemoryProjectIO
beforeEach(() => {
  io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
  setActivePinia(createPinia())
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

async function opened() {
  const s = useProjectStore()
  await s.create('book', { title: 'B', author: 'A', language: 'en' })
  const codex = useCodexStore()
  const scene = s.tree[0]!.children[0]!
  const anna = (await codex.createEntry({ name: 'Anna' }))!
  const harbor = (await codex.createEntry({ name: 'Harbor', typeId: codex.types[2]!.id }))!
  const links = () => s.linkIndex()!.linksFrom(scene.id)
  return { s, codex, id: scene.id, anna, harbor, links }
}

describe('link to codex entry', () => {
  it('adds one codex link per block and skips blocks already linked to that entry', async () => {
    const { id, anna, links } = await opened()
    expect(await linkSelectionToEntry(id, ['a', 'b'], anna)).toEqual({ ok: true, added: 2, skipped: 0 })
    expect(await linkSelectionToEntry(id, ['b', 'c', 'c'], anna)).toEqual({ ok: true, added: 1, skipped: 1 })
    expect(links().every((l) => l.kind === 'codex' && l.to.item === anna && l.to.block === undefined)).toBe(true)
    expect(links()).toHaveLength(3)
  })

  it('a block can hold an event link and entry links at once', async () => {
    const { id, anna, harbor, links } = await opened()
    await linkSelectionToNode(id, ['a'], 't1', 'n1')
    await linkSelectionToEntry(id, ['a'], anna)
    await linkSelectionToEntry(id, ['a'], harbor)
    expect(links().map((l) => l.kind).sort()).toEqual(['codex', 'codex', 'event'])
  })

  it('is refused when the project is read-only', async () => {
    const { s, id, anna, links } = await opened()
    await s.close()
    io.files.set(LOCK_PATH, JSON.stringify({ machine: 'elsewhere', pid: 42, timestamp: Date.now() }))
    await s.open('book')
    await s.resolveLockPrompt('readOnly')
    expect(await linkSelectionToEntry(id, ['a'], anna)).toEqual({ ok: false, reason: 'read-only' })
    expect(links()).toHaveLength(0)
  })

  it('relinks an entry link to another entry; a duplicate is refused', async () => {
    const { id, anna, harbor, links } = await opened()
    await linkSelectionToEntry(id, ['a'], anna)
    await linkSelectionToEntry(id, ['a'], harbor)
    const [first, second] = links()
    expect((await relinkLinkToEntry(first!.id, second!.to.item)).reason).toBe('duplicate')
    const other = (await useCodexStore().createEntry({ name: 'Cleo' }))!
    expect((await relinkLinkToEntry(first!.id, other)).ok).toBe(true)
    expect(links().find((l) => l.id === first!.id)!.to).toEqual({ item: other })
  })
})

describe('block links with entries', () => {
  it('shows entry name and type and counts events and entries together', async () => {
    const { id, anna, harbor } = await opened()
    await linkSelectionToEntry(id, ['a'], anna)
    await linkSelectionToEntry(id, ['a'], harbor)
    const rows = linksForBlock(id, 'a')
    expect(rows.map((r) => [r.kind, r.entry?.name, r.entry?.typeName, r.entryMissing])).toEqual(
      expect.arrayContaining([
        ['entry', 'Anna', 'Character', false],
        ['entry', 'Harbor', 'Place', false],
      ]),
    )
    expect(blockLinkInfoMap(id).get('a')).toEqual({ count: 2, broken: false, events: 0, entries: 2 })
  })

  it('a deleted entry makes the link broken and relinkable, until the entry is restored', async () => {
    const { id, anna, codex } = await opened()
    await linkSelectionToEntry(id, ['a'], anna)
    await linkSelectionToNode(id, ['a'], 't1', 'n1')
    await codex.deleteEntry(anna)
    const row = linksForBlock(id, 'a').find((r) => r.kind === 'entry')!
    expect(row).toMatchObject({ broken: true, entryMissing: true, entry: null, eventMissing: false })
    expect(blockLinkInfoMap(id).get('a')).toMatchObject({ count: 2, broken: true, entries: 1, events: 1 })
    expect((await unlinkLink(row.link.id)).ok).toBe(true)
    expect(linksForBlock(id, 'a').some((r) => r.kind === 'entry')).toBe(false)
  })

  it('event rows keep the old shape', async () => {
    const { id } = await opened()
    await linkSelectionToNode(id, ['a'], 't1', 'n1')
    const [row] = linksForBlock(id, 'a')
    expect(row).toMatchObject({ kind: 'event', eventMissing: true, entryMissing: false, entry: null })
  })
})
