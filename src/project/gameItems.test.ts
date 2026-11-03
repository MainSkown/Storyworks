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

const meta = { title: 'G', author: 'A', language: 'en' }

async function gameStore() {
  setActivePinia(createPinia())
  const s = useProjectStore()
  expect(await s.create('game', { ...meta, kind: 'game' })).toBe('opened')
  return s
}
const json = (path: string) => JSON.parse(io.files.get(path) as string)

describe('game project items', () => {
  it('starts with an empty tree', async () => {
    const s = await gameStore()
    expect(s.tree).toEqual([])
  })

  it('creates nested folders, scripts and conversations that survive close and reopen', async () => {
    const s = await gameStore()
    const f1 = await s.addFolder(null, 'Act 1')
    const f2 = await s.addFolder(f1, 'Village')
    const sc = await s.addScript(f2, 'Intro')
    const cv = await s.addConversation(f2, 'Blacksmith')
    const loose = await s.addScript(null, 'Prologue')
    await s.close()
    expect(await s.open('game/project.json')).toBe('opened')
    expect(s.issues).toEqual([])
    const shape = (n: (typeof s.tree)[number]): unknown => [n.type, n.title, n.children.map(shape)]
    expect(s.tree.map(shape)).toEqual([
      ['chapter', 'Act 1', [['chapter', 'Village', [['scene', 'Intro', []], ['conversation', 'Blacksmith', []]]]]],
      ['scene', 'Prologue', []],
    ])
    expect(s.tree[0].children[0].children.map((n) => n.id)).toEqual([sc, cv])
    expect(s.tree[1].id).toBe(loose)
  })

  it('a new script holds one empty line with the first line id', async () => {
    const s = await gameStore()
    const id = await s.addScript(null, 'Intro')
    await s.flush()
    const node = s.tree.find((n) => n.id === id)!
    const file = json(node.path as string)
    expect(file.content.content).toHaveLength(1)
    expect(file.content.content[0].attrs).toMatchObject({ lineId: 'L000001', speakerId: null })
    expect(s.reserveLineId()).toBe('L000002')
  })

  it('a new conversation is an empty valid file', async () => {
    const s = await gameStore()
    const id = await s.addConversation(null, 'Talk')
    await s.flush()
    const file = json(s.tree.find((n) => n.id === id)!.path as string)
    expect(file).toMatchObject({ version: 3, id, title: 'Talk', startNodeId: null, nodes: [] })
  })

  it('renaming a conversation changes the tree and the file', async () => {
    const s = await gameStore()
    const id = await s.addConversation(null, 'Talk')
    await s.rename(id, 'Haggling')
    await s.flush()
    expect(s.tree[0].title).toBe('Haggling')
    expect(json(s.tree[0].path as string).title).toBe('Haggling')
  })

  it('deleting and restoring a script and a conversation puts them back', async () => {
    const s = await gameStore()
    const folder = await s.addFolder(null, 'F')
    const sc = await s.addScript(folder, 'S')
    const cv = await s.addConversation(folder, 'C')
    for (const id of [sc, cv]) {
      const path = s.tree[0].children.find((n) => n.id === id)!.path as string
      await s.deleteItem(id)
      expect(io.files.has(path)).toBe(false)
      expect(s.tree[0].children.some((n) => n.id === id)).toBe(false)
      await s.restoreItem(id)
      expect(io.files.has(path)).toBe(true)
      expect(s.tree[0].children.some((n) => n.id === id)).toBe(true)
    }
    expect(s.tree[0].children.map((n) => n.id).sort()).toEqual([sc, cv].sort())
    expect(s.issues).toEqual([])
  })

  it('refuses items under a script or a conversation, and conversations under parts', async () => {
    const s = await gameStore()
    const sc = await s.addScript(null, 'S')
    const cv = await s.addConversation(null, 'C')
    await expect(s.addScene(sc)).rejects.toThrow()
    await expect(s.addScene(cv)).rejects.toThrow()
    await expect(s.addConversation(sc)).rejects.toThrow()
    await expect(s.addFolder(cv)).rejects.toThrow()
  })

  it('folders do not nest in a book', async () => {
    setActivePinia(createPinia())
    const s = useProjectStore()
    await s.create('book', meta)
    const ch = s.tree[0].id
    await expect(s.addChapter(ch)).rejects.toThrow()
  })

  it('moving a folder into another folder keeps the files', async () => {
    const s = await gameStore()
    const a = await s.addFolder(null, 'A')
    const b = await s.addFolder(null, 'B')
    const sc = await s.addScript(b, 'S')
    expect(await s.moveItem(b, a, 0)).toBe(true)
    expect(s.tree.map((n) => n.id)).toEqual([a])
    expect(s.tree[0].children[0].children[0].id).toBe(sc)
  })

  it('an invalid conversation file is reported and left untouched', async () => {
    const s = await gameStore()
    const id = await s.addConversation(null, 'C')
    await s.flush()
    const path = s.tree.find((n) => n.id === id)!.path as string
    io.files.set(path, '{"version":1,"id":"x"}')
    const before = io.files.get(path)
    await s.close()
    await s.open('game/project.json')
    expect(s.issues.some((i) => i.kind === 'invalid' && i.itemId === id)).toBe(true)
    expect(io.files.get(path)).toBe(before)
  })
})

describe('speaker references', () => {
  it('counts the lines a codex entry speaks, across scripts', async () => {
    const s = await gameStore()
    const line = (n: number, speakerId: string | null) => ({
      type: 'line',
      attrs: { id: `b${n}`, lineId: `L00000${n}`, speakerId, speakerName: null },
    })
    const a = await s.addScript(null, 'A')
    const b = await s.addScript(null, 'B')
    await s.setSceneContent(a, { type: 'doc', content: [line(1, 'e1'), line(2, null), line(3, 'e1')] }, 0)
    await s.setSceneContent(b, { type: 'doc', content: [line(4, 'e1'), line(5, 'e2')] }, 0)
    expect(s.speakerLinesOf('e1')).toBe(3)
    expect(s.speakerLinesOf('e2')).toBe(1)
    expect(s.speakerLinesOf('none')).toBe(0)
  })
})

describe('text items', () => {
  it('a new text item is a scene file with one empty paragraph, flagged as text', async () => {
    const s = await gameStore()
    const folder = await s.addFolder(null, 'F')
    const id = await s.addText(folder, 'Harbour')
    await s.flush()
    const node = s.tree[0].children.find((n) => n.id === id)!
    expect(node.type).toBe('scene')
    const file = json(node.path as string)
    expect(file.content.content).toHaveLength(1)
    expect(file.content.content[0]).toMatchObject({ type: 'paragraph' })
    expect(typeof file.content.content[0].attrs.id).toBe('string')
    expect(s.sceneMeta.get(id)?.form).toBe('text')
  })

  it('a script is flagged as script, and text items never use line ids', async () => {
    const s = await gameStore()
    const sc = await s.addScript(null, 'S')
    await s.addText(null, 'T')
    expect(s.sceneMeta.get(sc)?.form).toBe('script')
    expect(s.reserveLineId()).toBe('L000002')
  })

  it('survives close and reopen, and edits keep it a text item', async () => {
    const s = await gameStore()
    const id = await s.addText(null, 'T')
    await s.setSceneContent(
      id,
      { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'Gulls wheel over the quay.' }] }] },
      5,
    )
    await s.close()
    await s.open('game/project.json')
    expect(s.sceneMeta.get(id)?.form).toBe('text')
    expect(s.wordCounts.get(id)).toBe(5)
    expect(s.issues).toEqual([])
  })

  it('can be deleted and restored like a script', async () => {
    const s = await gameStore()
    const id = await s.addText(null, 'T')
    await s.deleteItem(id)
    expect(s.tree).toEqual([])
    await s.restoreItem(id)
    expect(s.sceneMeta.get(id)?.form).toBe('text')
  })

  it('cannot be added under a script', async () => {
    const s = await gameStore()
    const sc = await s.addScript(null, 'S')
    await expect(s.addText(sc, 'T')).rejects.toThrow()
  })
})
