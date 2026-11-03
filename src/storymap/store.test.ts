import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { STORY_MAP_FILE } from '../project/schemas/storyMap'
import { addBeat, syncItems } from './ops'
import { useStoryMapStore } from './store'

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
  expect(await p.create('game', { title: 'G', author: 'A', language: 'en', kind: 'game' })).toBe('opened')
  return { p, s: useStoryMapStore() }
}
const json = (path: string) => JSON.parse(io.files.get(path) as string)
const beat = (id: string) => (m: Parameters<typeof addBeat>[0]) => addBeat(m, { id, text: 'Storm', x: 1, y: 2 })

describe('story map store', () => {
  it('a new game has no story map file; a no-change edit does not create one', async () => {
    const { p, s } = await opened()
    expect(s.status).toBe('none')
    expect(await s.edit((m) => syncItems(m, [], () => 'x'))).toBe(true)
    await p.flush()
    expect(io.files.has(STORY_MAP_FILE)).toBe(false)
  })

  it('the first change creates the file and the manifest ref; the map survives reopen', async () => {
    const { p, s } = await opened()
    expect(await s.edit(beat('b1'))).toBe(true)
    await p.flush()
    expect(json(STORY_MAP_FILE).boxes).toHaveLength(1)
    expect(json('project.json').storyMap).toMatchObject({ path: STORY_MAP_FILE })
    await s.edit(beat('b2'))
    await p.close()
    await p.open('game/project.json')
    expect(s.map.boxes.map((b) => b.id)).toEqual(['b1', 'b2'])
  })

  it('an invalid file is reported, left untouched and refuses edits', async () => {
    const { p, s } = await opened()
    await s.edit(beat('b1'))
    await p.flush()
    io.files.set(STORY_MAP_FILE, '{"version":1,"boxes":[{"id":"1"}]}')
    const before = io.files.get(STORY_MAP_FILE)
    await p.close()
    await p.open('game/project.json')
    expect(s.status).toBe('invalid')
    expect(await s.edit(beat('b9'))).toBe(false)
    await p.flush()
    expect(io.files.get(STORY_MAP_FILE)).toBe(before)
  })

  it('a missing file is reported', async () => {
    const { p, s } = await opened()
    await s.edit(beat('b1'))
    await p.flush()
    io.files.delete(STORY_MAP_FILE)
    await p.close()
    await p.open('game/project.json')
    expect(s.status).toBe('missing')
  })

  it('refuses a map that does not validate without writing', async () => {
    const { p, s } = await opened()
    await s.edit(beat('b1'))
    await p.flush()
    const before = io.files.get(STORY_MAP_FILE)
    expect(await s.save({ ...s.map, arrows: [{ id: 'a', from: 'b1', to: 'nope' }] })).toBe(false)
    await p.flush()
    expect(io.files.get(STORY_MAP_FILE)).toBe(before)
  })
})
