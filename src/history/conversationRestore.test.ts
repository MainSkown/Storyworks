import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryFileIO } from '../io/fileIO'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { useHistoryStore } from './store'

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

const json = (path: string) => JSON.parse(io.files.get(path) as string)

describe('restoring a conversation', () => {
  it('brings back the snapshot nodes and line ids, and the counter never goes down', async () => {
    setActivePinia(createPinia())
    const p = useProjectStore()
    await p.create('game', { title: 'G', author: 'A', language: 'en', kind: 'game' })
    const id = await p.addConversation(null, 'Talk')
    const a = (await p.addConversationNode(id, 'lines'))!
    await p.flush()
    const h = useHistoryStore()
    await h.refresh()
    await h.snapshotAll()
    const snapId = h.snapshots[0]!.id
    const path = p.tree[0]!.path as string
    const saved = io.files.get(path)

    await p.addConversationNode(id, 'lines', { afterId: a }) // issues L000002
    await p.patchConversation(id, (c) => ({ ...c, title: 'Changed' }))
    await p.flush()
    expect(json('project.json').lineCounter).toBe(2)

    await h.restoreItem(snapId, `node:${id}`)
    expect(io.files.get(path)).toBe(saved)
    const c = await p.loadConversation(id)
    expect(c.ok && c.value.nodes).toHaveLength(1)
    expect(p.reserveLineId()).toBe('L000003')
  })
})
