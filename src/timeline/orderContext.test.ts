import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { setFileIOFactory } from '../settings/store'
import { setProjectIOFactory, useProjectStore } from '../project/store'
import { compare } from './order'
import { useOrderContext } from './orderContext'
import { useTimelinesStore } from './store'

beforeEach(() => {
  const io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})

describe('useOrderContext', () => {
  it('sees edits made after it was created', async () => {
    setActivePinia(createPinia())
    await useProjectStore().create('book', { title: 'B', author: 'A', language: 'en' })
    const t = useTimelinesStore()
    const ctx = useOrderContext()
    const tid = t.entries[0].id
    const a = (t.addNode({ title: 'A' }) as { id: string }).id
    const b = (t.addNode({ title: 'B', connect: true }) as { id: string }).id
    const pos = (nodeId: string) => ({ node: { timelineId: tid, nodeId } })
    expect(compare(pos(a), pos(b), ctx.value)).toBe('before')
    expect(ctx.value.timeline('nope')).toBeUndefined()
  })
})
