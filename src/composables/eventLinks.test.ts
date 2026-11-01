import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { LOCK_PATH } from '../project/lock'
import { linkSelectionToNode, relinkLink, unlinkLink } from './eventLinks'

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
  const scene = s.tree[0]!.children[0]!
  const links = () => s.linkIndex()!.linksFrom(scene.id)
  return { s, id: scene.id, links }
}

describe('event link actions', () => {
  it('links every block once and skips ones already linked to that event', async () => {
    const { id, links } = await opened()
    expect(await linkSelectionToNode(id, ['a', 'b'], 't1', 'n1')).toEqual({
      ok: true,
      added: 2,
      skipped: 0,
    })
    expect(await linkSelectionToNode(id, ['b', 'c', 'c'], 't1', 'n1')).toEqual({
      ok: true,
      added: 1,
      skipped: 1,
    })
    expect(await linkSelectionToNode(id, ['a'], 't1', 'n1')).toEqual({
      ok: true,
      added: 0,
      skipped: 1,
    })
    expect(links()).toHaveLength(3)
  })

  it('a block can link to several events', async () => {
    const { id, links } = await opened()
    await linkSelectionToNode(id, ['a'], 't1', 'n1')
    await linkSelectionToNode(id, ['a'], 't1', 'n2')
    expect(links().map((l) => l.to.block).sort()).toEqual(['n1', 'n2'])
  })

  it('unlink removes one link; relink replaces its target', async () => {
    const { id, links } = await opened()
    await linkSelectionToNode(id, ['a'], 't1', 'n1')
    await linkSelectionToNode(id, ['b'], 't1', 'n1')
    const [first, second] = links()
    expect((await relinkLink(first!.id, 't2', 'n9')).ok).toBe(true)
    expect(links().find((l) => l.id === first!.id)!.to).toEqual({ item: 't2', block: 'n9' })
    expect((await unlinkLink(second!.id)).ok).toBe(true)
    expect(links().map((l) => l.id)).toEqual([first!.id])
  })

  it('relink to an event the block already links to is refused', async () => {
    const { id, links } = await opened()
    await linkSelectionToNode(id, ['a'], 't1', 'n1')
    await linkSelectionToNode(id, ['a'], 't1', 'n2')
    const r = await relinkLink(links()[0]!.id, 't1', links()[1]!.to.block!)
    expect(r).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('is refused when the project is read-only', async () => {
    const { s, id, links } = await opened()
    await linkSelectionToNode(id, ['a'], 't1', 'n1')
    const linkId = links()[0]!.id
    await s.close()
    io.files.set(
      LOCK_PATH,
      JSON.stringify({ machine: 'elsewhere', pid: 42, timestamp: Date.now() }),
    )
    await s.open('book')
    await s.resolveLockPrompt('readOnly')
    expect(await linkSelectionToNode(id, ['b'], 't1', 'n1')).toEqual({ ok: false, reason: 'read-only' })
    expect(await unlinkLink(linkId)).toEqual({ ok: false, reason: 'read-only' })
    expect(await relinkLink(linkId, 't1', 'n2')).toEqual({ ok: false, reason: 'read-only' })
    expect(links()).toHaveLength(1)
  })
})
