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

const line = (n: number) => ({
  type: 'line',
  attrs: {
    id: `b${n}`,
    lineId: `L${String(n).padStart(6, '0')}`,
    speakerId: null,
    speakerName: null,
  },
})

async function gameStore() {
  setActivePinia(createPinia())
  const s = useProjectStore()
  expect(await s.create('game', { title: 'G', author: 'A', language: 'en', kind: 'game' })).toBe(
    'opened',
  )
  return s
}

describe('line counter', () => {
  it('issues increasing ids and saves the counter in the manifest', async () => {
    const s = await gameStore()
    expect([s.reserveLineId(), s.reserveLineId(), s.reserveLineId()]).toEqual([
      'L000001',
      'L000002',
      'L000003',
    ])
    await s.flush()
    expect(JSON.parse(io.files.get('project.json') as string).lineCounter).toBe(3)
  })

  it('survives close and reopen', async () => {
    const s = await gameStore()
    s.reserveLineId()
    s.reserveLineId()
    await s.close()
    expect(await s.open('game/project.json')).toBe('opened')
    expect(s.reserveLineId()).toBe('L000003')
  })

  it('is raised when a script with higher ids is saved', async () => {
    const s = await gameStore()
    const id = await s.addScene(null, 'Script')
    await s.setSceneContent(id, { type: 'doc', content: [line(7), line(9)] }, 0)
    expect(s.reserveLineId()).toBe('L000010')
  })

  it('is raised when a script with higher ids is opened', async () => {
    const s = await gameStore()
    const id = await s.addScene(null, 'Script')
    await s.setSceneContent(id, { type: 'doc', content: [line(40)] }, 0)
    await s.flush()
    const m = JSON.parse(io.files.get('project.json') as string)
    io.files.set('project.json', JSON.stringify({ ...m, lineCounter: 5 }, null, 2) + '\n')
    await s.close()
    await s.open('game/project.json')
    expect(s.reserveLineId()).toBe('L000041')
  })

  it('refuses to issue ids in a read-only project', async () => {
    const s = await gameStore()
    await s.close()
    expect(() => s.reserveLineId()).toThrow()
  })
})
