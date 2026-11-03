import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { useSearchStore } from './store'

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

const linesDoc = (text: string) => ({
  type: 'doc',
  content: [
    {
      type: 'line',
      attrs: { id: 'b1', lineId: 'L000001', speakerId: null, speakerName: null },
      content: [{ type: 'text', text }],
    },
  ],
})
const hits = (s: ReturnType<typeof useSearchStore>, q: string) =>
  s.find(q).groups.flatMap((g) => g.hits.map((h) => h.id))

async function setup() {
  setActivePinia(createPinia())
  const p = useProjectStore()
  await p.create('game', { title: 'G', author: 'A', language: 'en', kind: 'game' })
  const id = await p.addConversation(null, 'Talk')
  const nodeId = await p.addConversationNode(id, 'lines')
  await p.patchConversation(id, (c) => ({
    ...c,
    nodes: c.nodes.map((n) => (n.type === 'lines' ? { ...n, content: linesDoc('alpha beta') } : n)),
  }))
  await p.flush()
  const search = useSearchStore()
  await expect.poll(() => hits(search, 'alpha')).toEqual([id])
  return { p, search, id, nodeId, path: p.tree.find((n) => n.id === id)?.path as string }
}

describe('search index of conversations', () => {
  it('a hit carries the node it sits in', async () => {
    const { search, nodeId } = await setup()
    expect(search.find('alpha').groups[0].hits[0].nodeId).toBe(nodeId)
  })

  it('an outside change with the same word count replaces the stale text', async () => {
    const { p, search, id, path } = await setup()
    const file = JSON.parse(io.files.get(path) as string)
    file.nodes[0].content = linesDoc('gamma delta')
    io.files.set(path, JSON.stringify(file))
    io.emit([path])
    await expect.poll(() => hits(search, 'gamma')).toEqual([id])
    expect(hits(search, 'alpha')).toEqual([])
    expect(p.itemVersion(path)).toBeGreaterThan(0)
  })

  it('a project reload (snapshot restore) with the same word count replaces the stale text', async () => {
    const { p, search, id, path } = await setup()
    const file = JSON.parse(io.files.get(path) as string)
    file.nodes[0].content = linesDoc('gamma delta')
    io.files.set(path, JSON.stringify(file))
    expect(hits(search, 'alpha')).toEqual([id]) // stale until the reload
    expect(await p.reloadManifest()).toBe(true)
    await expect.poll(() => hits(search, 'gamma')).toEqual([id])
    expect(hits(search, 'alpha')).toEqual([])
  })
})
