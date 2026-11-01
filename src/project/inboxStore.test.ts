import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { LOCK_PATH } from './lock'
import { inboxSchema } from './schemas/inbox'
import { parseFile } from './serialize'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from './store'

const META = { title: 'My Book', author: 'Ann', language: 'en' }
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

const para = (text: string, id?: string) => ({
  type: 'paragraph',
  ...(id ? { attrs: { id } } : {}),
  content: [{ type: 'text', text }],
})
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks })

async function opened() {
  setActivePinia(createPinia())
  const s = useProjectStore()
  expect(await s.create('book', META)).toBe('opened')
  const scene = s.tree[0].children[0]
  return { s, scene }
}

const diskInbox = () => {
  const r = parseFile(inboxSchema, io.files.get('inbox.json') as string, 'inbox.json')
  if (!r.ok) throw new Error('inbox.json invalid')
  return r.value
}
const textsOf = (content: unknown) =>
  ((content as { content: { content?: { text: string }[] }[] }).content ?? []).map(
    (b) => b.content?.[0]?.text,
  )
const idsOf = (content: unknown) =>
  ((content as { content: { attrs?: { id?: string } }[] }).content ?? []).map((b) => b.attrs?.id)

async function sceneContent(s: ReturnType<typeof useProjectStore>, path: string) {
  const r = await s.loadScene(path)
  if (!r.ok) throw new Error('scene invalid')
  return r.value.content
}

describe('inbox notes', () => {
  it('no inbox.json until the first note; then it is created and registered', async () => {
    const { s } = await opened()
    expect(s.project?.manifest.inbox).toBeNull()
    expect(io.files.has('inbox.json')).toBe(false)
    const id = await s.addNote('Idea')
    await s.flush()
    expect(s.project?.manifest.inbox?.path).toBe('inbox.json')
    expect(JSON.parse(io.files.get('project.json') as string).inbox.path).toBe('inbox.json')
    expect(diskInbox().notes.map((n) => [n.id, n.title])).toEqual([[id, 'Idea']])
  })

  it('a second note reuses the same file', async () => {
    const { s } = await opened()
    await s.addNote()
    const ref = s.project?.manifest.inbox
    await s.addNote()
    await s.flush()
    expect(s.project?.manifest.inbox).toEqual(ref)
    expect(diskInbox().notes).toHaveLength(2)
  })

  it('edits and renames are saved and survive a reopen', async () => {
    const { s } = await opened()
    const id = await s.addNote('Old')
    expect(s.updateNote(id, { title: 'New', content: doc(para('hello')) })).toBe(true)
    await s.flush()
    expect(diskInbox().notes[0].title).toBe('New')
    await s.close()
    await s.open('book')
    expect(s.inboxNotes.map((n) => n.title)).toEqual(['New'])
    expect(textsOf(s.inboxNotes[0].content)).toEqual(['hello'])
  })

  it('an empty title drops the title', async () => {
    const { s } = await opened()
    const id = await s.addNote('Old')
    s.updateNote(id, { title: '' })
    await s.flush()
    expect(diskInbox().notes[0].title).toBeUndefined()
  })

  it('read-only refuses writes', async () => {
    const { s } = await opened()
    const id = await s.addNote('Keep')
    await s.flush()
    await s.close()
    io.files.set(LOCK_PATH, JSON.stringify({ machine: 'elsewhere', pid: 1, timestamp: Date.now() }))
    await s.open('book')
    await s.resolveLockPrompt('readOnly')
    expect(s.updateNote(id, { title: 'Nope' })).toBe(false)
    await expect(s.addNote('x')).rejects.toThrow()
    await expect(s.deleteNote(id)).rejects.toThrow()
    await s.flush()
    expect(diskInbox().notes.map((n) => n.title)).toEqual(['Keep'])
  })

  it('an invalid inbox.json is flagged and left untouched', async () => {
    const { s } = await opened()
    await s.addNote('A')
    await s.flush()
    await s.close()
    io.files.set('inbox.json', '{ not json')
    await s.open('book')
    expect(s.issues.some((i) => i.kind === 'invalid' && i.path === 'inbox.json')).toBe(true)
    expect(s.inboxInvalid).toBe(true)
    expect(s.inboxNotes).toEqual([])
    await expect(s.addNote('B')).rejects.toThrow()
    await s.flush()
    expect(io.files.get('inbox.json')).toBe('{ not json')
  })
})

describe('moving notes into the manuscript', () => {
  it('move to scene appends at the end with fresh block ids and removes the note', async () => {
    const { s, scene } = await opened()
    await s.setSceneContent(scene.id, doc(para('first', 's1')), 1)
    const id = await s.addNote('N')
    s.updateNote(id, { content: doc(para('n one', 's1'), para('n two', 'n2')) })
    expect(await s.moveNoteToScene(id, scene.id)).toBe(true)
    await s.flush()
    const content = await sceneContent(s, scene.path as string)
    expect(textsOf(content)).toEqual(['first', 'n one', 'n two'])
    const ids = idsOf(content)
    expect(ids[0]).toBe('s1')
    expect(new Set(ids).size).toBe(3)
    expect(ids).not.toContain('n2')
    expect(s.inboxNotes).toEqual([])
    expect(diskInbox().notes).toEqual([])
    expect(s.trash).toEqual([])
  })

  it('updates the scene word count', async () => {
    const { s, scene } = await opened()
    const id = await s.addNote()
    s.updateNote(id, { content: doc(para('one two three')) })
    await s.moveNoteToScene(id, scene.id)
    expect(s.sceneMeta.get(scene.id)?.wordCount).toBe(3)
  })

  it('move to a missing or non-scene target changes nothing', async () => {
    const { s } = await opened()
    const id = await s.addNote()
    expect(await s.moveNoteToScene(id, 'nope')).toBe(false)
    expect(await s.moveNoteToScene(id, s.tree[0].id)).toBe(false)
    expect(s.inboxNotes).toHaveLength(1)
  })

  it('new scene from a note is added at the end of the chosen parent', async () => {
    const { s, scene } = await opened()
    const chapter = s.tree[0]
    const id = await s.addNote('Scene idea')
    s.updateNote(id, { content: doc(para('body', 'x')) })
    const newId = await s.createSceneFromNote(id, chapter.id)
    expect(newId).toBeTruthy()
    await s.flush()
    expect(s.tree[0].children.map((c) => c.id)).toEqual([scene.id, newId])
    const node = s.tree[0].children[1]
    expect(node.title).toBe('Scene idea')
    const content = await sceneContent(s, node.path as string)
    expect(textsOf(content)).toEqual(['body'])
    expect(idsOf(content)[0]).not.toBe('x')
    expect(s.inboxNotes).toEqual([])
  })

  it('new scene from an untitled note gets the default title', async () => {
    const { s } = await opened()
    const id = await s.addNote()
    const newId = await s.createSceneFromNote(id, s.tree[0].id)
    expect(newId && s.tree[0].children.find((c) => c.id === newId)?.title).toBe('New scene')
  })

  it('a scene deleted after a note moved into it leaves no inbox copy', async () => {
    const { s, scene } = await opened()
    const id = await s.addNote()
    s.updateNote(id, { content: doc(para('kept in scene')) })
    await s.moveNoteToScene(id, scene.id)
    await s.deleteItem(scene.id)
    await s.flush()
    expect(s.inboxNotes).toEqual([])
    expect(diskInbox().notes).toEqual([])
    expect(s.trash.map((t) => t.type)).toEqual(['scene'])
    const trashed = io.files.get(s.trash[0].trashPath) as string
    expect(trashed).toContain('kept in scene')
  })
})

describe('deleting notes', () => {
  it('goes to the trash as a note entry and leaves the inbox', async () => {
    const { s } = await opened()
    const id = await s.addNote('Gone')
    s.updateNote(id, { content: doc(para('text')) })
    const entry = await s.deleteNote(id)
    await s.flush()
    expect(entry.type).toBe('note')
    expect(entry.title).toBe('Gone')
    expect(s.trash.map((t) => t.id)).toEqual([id])
    expect(s.inboxNotes).toEqual([])
    expect(diskInbox().notes).toEqual([])
    expect(io.files.get(entry.trashPath)).toContain('text')
  })

  it('restore returns the note to the inbox with its content', async () => {
    const { s } = await opened()
    const id = await s.addNote('Back')
    s.updateNote(id, { content: doc(para('words')) })
    await s.addNote('Other')
    const entry = await s.deleteNote(id)
    await s.restoreItem(id)
    await s.flush()
    expect(s.trash).toEqual([])
    expect(io.files.has(entry.trashPath)).toBe(false)
    const note = s.inboxNotes.find((n) => n.id === id)
    expect(note?.title).toBe('Back')
    expect(textsOf(note?.content)).toEqual(['words'])
    expect(diskInbox().notes.map((n) => n.id)).toContain(id)
  })

  it('restoring a note into a project whose inbox was never created works', async () => {
    const { s } = await opened()
    const id = await s.addNote('Solo')
    await s.deleteNote(id)
    await s.restoreItem(id)
    expect(s.inboxNotes.map((n) => n.id)).toEqual([id])
  })

  it('a trashed note keeps an untitled note listable (title falls back to its text)', async () => {
    const { s } = await opened()
    const id = await s.addNote()
    s.updateNote(id, { content: doc(para('Some loose idea')) })
    const entry = await s.deleteNote(id)
    expect(entry.title).toBe('Some loose idea')
  })
})
