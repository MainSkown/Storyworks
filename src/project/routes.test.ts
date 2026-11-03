import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from './store'

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

async function game() {
  setActivePinia(createPinia())
  const s = useProjectStore()
  expect(await s.create('game', { title: 'G', author: 'A', language: 'en', kind: 'game' })).toBe('opened')
  return s
}
const ref = { timelineId: 't1', branchId: 'b1' }
const find = (s: ReturnType<typeof useProjectStore>, id: string) => s.tree.find((n) => n.id === id)

describe('item routes', () => {
  it('tags an item, survives reopen, and an empty list clears the tags', async () => {
    const s = await game()
    const c = await s.addConversation(null, 'Talk')
    expect(s.setItemRoutes(c, [ref])).toBe(true)
    await s.flush()
    await s.close()
    await s.open('game/project.json')
    expect(find(s, c)?.routes).toEqual([ref])
    s.setItemRoutes(c, [])
    expect(find(s, c) && 'routes' in find(s, c)!).toBe(false)
  })

  it('refuses folders and unknown ids', async () => {
    const s = await game()
    const f = await s.addFolder(null, 'Act')
    expect(s.setItemRoutes(f, [ref])).toBe(false)
    expect(s.setItemRoutes('nope', [ref])).toBe(false)
  })

  it('routes survive trash and restore', async () => {
    const s = await game()
    const c = await s.addConversation(null, 'Talk')
    s.setItemRoutes(c, [ref])
    await s.deleteItem(c)
    expect(s.trash.find((t) => t.id === c)?.routes).toEqual([ref])
    await s.restoreItem(c)
    expect(find(s, c)?.routes).toEqual([ref])
  })
})
