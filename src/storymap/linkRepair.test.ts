import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { linkProblems, setJumpLink } from '../game/crossLinks'
import { addNode } from '../game/conversationGraph'
import { derivedArrows, syncItems } from './ops'
import { emptyStoryMap } from './ops'
import { gameItems, linkContext } from './items'

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

describe('cross-link lifecycle', () => {
  it('a link breaks when its target is deleted and is repaired by restore', async () => {
    setActivePinia(createPinia())
    const s = useProjectStore()
    await s.create('game', { title: 'G', author: 'A', language: 'en', kind: 'game' })
    const from = await s.addConversation(null, 'From')
    const to = await s.addConversation(null, 'To')
    await s.patchConversation(from, (c) =>
      setJumpLink(addNode(c, 'jump', { id: 'j', x: 0, y: 0 }), 'j', { itemId: to }),
    )
    const problems = async () => {
      const conv = await s.loadConversation(from)
      if (!conv.ok) throw new Error('load')
      return linkProblems(conv.value, linkContext(gameItems(s.project!.manifest), () => null))
    }
    expect(await problems()).toEqual([])
    await s.deleteItem(to)
    expect(await problems()).toMatchObject([{ nodeId: 'j', reason: 'item-trashed' }])
    await s.restoreItem(to)
    expect(await problems()).toEqual([])
  })

  it('the story map keeps the box of a trashed item and its derived arrow', async () => {
    setActivePinia(createPinia())
    const s = useProjectStore()
    await s.create('game', { title: 'G', author: 'A', language: 'en', kind: 'game' })
    const from = await s.addConversation(null, 'From')
    const to = await s.addConversation(null, 'To')
    await s.patchConversation(from, (c) =>
      setJumpLink(addNode(c, 'jump', { id: 'j', x: 0, y: 0 }), 'j', { itemId: to }),
    )
    let n = 0
    const map = syncItems(emptyStoryMap(), [from, to], () => `b${++n}`)
    await s.deleteItem(to)
    const live = gameItems(s.project!.manifest).filter((i) => !i.trashed).map((i) => i.id)
    const again = syncItems(map, live, () => `x${++n}`)
    expect(again.boxes).toHaveLength(2)
    const conv = await s.loadConversation(from)
    if (!conv.ok) throw new Error('load')
    expect(derivedArrows(again, [{ id: from, conversation: conv.value }])).toHaveLength(1)
  })
})
