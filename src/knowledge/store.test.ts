import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { createProject } from '../project/open'
import { knowledgePath } from '../project/knowledge'
import { useCodexStore } from '../codex/store'
import { useRulesStore } from '../rules/store'
import { useKnowledgeStore } from './store'

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

const date = (year: number) => ({ date: { year, month: 0, day: 1 } })
const node = (nodeId: string) => ({ node: { timelineId: 't', nodeId } })

async function opened() {
  setActivePinia(createPinia())
  const p = useProjectStore()
  expect(await p.create('book', META)).toBe('opened')
  const c = useCodexStore()
  const k = useKnowledgeStore()
  const a = (await c.createEntry({ name: 'Anna' })) as string
  const b = (await c.createEntry({ name: 'Boris' })) as string
  return { p, c, k, a, b }
}

const json = (path: string) => JSON.parse(io.files.get(path) as string)
const manifest = () => json('project.json')

describe('items', () => {
  it('a new book has none; create, update and delete are saved', async () => {
    const { p, k, a } = await opened()
    expect(k.items).toEqual([])
    const id = (await k.createItem({
      title: ' The secret ',
      tags: ['x'],
      about: { type: 'entry', id: a },
    })) as string
    expect(k.items[0]).toMatchObject({ id, title: 'The secret', tags: ['x'], learnings: [] })
    expect(k.itemList[0]).toMatchObject({ id, title: 'The secret', status: 'ok' })
    expect(k.updateItem(id, { title: 'The truth', about: null })).toEqual({ ok: true })
    await p.flush()
    expect(json(knowledgePath(id))).toMatchObject({ title: 'The truth', about: null })
    expect(manifest().knowledge).toEqual([
      expect.objectContaining({ id, path: knowledgePath(id), title: 'The truth' }),
    ])
    expect(await k.deleteItem(id)).toEqual({ ok: true })
    expect(io.files.has(knowledgePath(id))).toBe(false)
    expect(manifest().knowledge).toEqual([])
    expect(k.items).toEqual([])
  })

  it('an empty title and an unknown item are refused', async () => {
    const { k } = await opened()
    expect(await k.createItem({ title: '  ' })).toBeNull()
    expect(k.updateItem('nope', { title: 'x' })).toEqual({ ok: false, reason: 'unknown-item' })
    const id = (await k.createItem({ title: 'T' })) as string
    expect(k.updateItem(id, { title: ' ' })).toEqual({ ok: false, reason: 'empty-title' })
    expect(await k.deleteItem('nope')).toEqual({ ok: false, reason: 'unknown-item' })
  })

  it('an invalid item file is listed as invalid and never repaired', async () => {
    const { p, k } = await opened()
    const id = (await k.createItem({ title: 'T' })) as string
    await p.flush()
    io.files.set(knowledgePath(id), '{"version":1}')
    await p.open('book')
    const k2 = useKnowledgeStore()
    expect(k2.items).toEqual([])
    expect(k2.itemList[0]).toMatchObject({ id, status: 'invalid' })
    expect(io.files.get(knowledgePath(id))).toBe('{"version":1}')
  })

  it('an outside edit of the file is read back', async () => {
    const { p, k } = await opened()
    const id = (await k.createItem({ title: 'T' })) as string
    await p.flush()
    const path = knowledgePath(id)
    io.files.set(path, JSON.stringify({ ...json(path), title: 'Theirs' }))
    io.emit([path])
    await expect.poll(() => k.items[0]?.title).toBe('Theirs')
    io.files.set(path, '{"version":1}')
    io.emit([path])
    await expect.poll(() => k.itemList[0]?.status).toBe('invalid')
    expect(k.items).toEqual([])
  })
})

describe('learnings', () => {
  it('add, update and remove are saved on the item file', async () => {
    const { p, k, a, b } = await opened()
    const id = (await k.createItem({ title: 'T' })) as string
    const added = k.addLearning(id, { entryId: a, at: date(1), note: 'told' })
    if (!added.ok) throw new Error('add failed')
    expect(k.items[0].learnings).toEqual([
      { id: added.id, entryId: a, at: date(1), note: 'told', forgottenAt: null, revealedIn: null },
    ])
    expect(
      k.updateLearning(id, added.id, {
        entryId: b,
        forgottenAt: date(5),
        revealedIn: { sceneId: 's', blockId: 'x' },
      }),
    ).toEqual({ ok: true })
    await p.flush()
    expect(json(knowledgePath(id)).learnings[0]).toMatchObject({
      entryId: b,
      forgottenAt: date(5),
      revealedIn: { sceneId: 's', blockId: 'x' },
    })
    expect(k.removeLearning(id, added.id)).toEqual({ ok: true })
    expect(k.removeLearning(id, added.id)).toEqual({ ok: false, reason: 'unknown-learning' })
    await p.flush()
    expect(json(knowledgePath(id)).learnings).toEqual([])
  })

  it('refuses a missing entry, unknown item and unknown learning', async () => {
    const { k, a } = await opened()
    const id = (await k.createItem({ title: 'T' })) as string
    expect(k.addLearning(id, { entryId: 'gone', at: date(1) })).toEqual({
      ok: false,
      reason: 'unknown-entry',
    })
    expect(k.addLearning('nope', { entryId: a, at: date(1) })).toEqual({
      ok: false,
      reason: 'unknown-item',
    })
    expect(k.updateLearning(id, 'nope', { note: 'x' })).toEqual({
      ok: false,
      reason: 'unknown-learning',
    })
    expect(k.items[0].learnings).toEqual([])
  })

  it('forgotten before learned is judged by the injected function; unknown order is accepted', async () => {
    const { k, a } = await opened()
    const id = (await k.createItem({ title: 'T' })) as string
    const year = (p: unknown) => (p as ReturnType<typeof date>).date?.year ?? NaN
    const earlier = (at: unknown, f: unknown) => year(f) <= year(at)
    const input = { entryId: a, at: date(5), forgottenAt: date(1) }
    expect(k.addLearning(id, input, earlier)).toEqual({
      ok: false,
      reason: 'forgotten-before-learned',
    })
    expect(k.addLearning(id, { ...input, forgottenAt: node('n') }, () => false).ok).toBe(true)
    const ok = k.addLearning(id, { ...input, forgottenAt: date(9) }, earlier)
    if (!ok.ok) throw new Error('add failed')
    expect(k.updateLearning(id, ok.id, { forgottenAt: date(2) }, earlier)).toEqual({
      ok: false,
      reason: 'forgotten-before-learned',
    })
    expect(k.updateLearning(id, ok.id, { at: date(20) }, earlier)).toEqual({
      ok: false,
      reason: 'forgotten-before-learned',
    })
  })

  it('a trashed learner breaks the learning but it stays editable; restore fixes it', async () => {
    const { p, c, k, a, b } = await opened()
    const id = (await k.createItem({ title: 'T' })) as string
    const added = k.addLearning(id, { entryId: a, at: date(1) })
    if (!added.ok) throw new Error('add failed')
    expect(k.brokenLearningIds).toEqual([])
    await c.deleteEntry(a)
    expect(k.brokenLearningIds).toEqual([{ itemId: id, learningId: added.id }])
    expect(k.items[0].learnings).toHaveLength(1)
    expect(k.updateLearning(id, added.id, { note: 'still here' })).toEqual({ ok: true })
    expect(k.updateLearning(id, added.id, { entryId: a })).toEqual({ ok: true }) // entry unchanged: not re-checked
    expect(k.updateLearning(id, added.id, { entryId: 'gone' })).toEqual({
      ok: false,
      reason: 'unknown-entry',
    })
    await p.restoreItem(a)
    expect(k.brokenLearningIds).toEqual([])
    expect(k.updateLearning(id, added.id, { entryId: b })).toEqual({ ok: true })
  })

  it('about is broken when its rule or entry is gone', async () => {
    const { c, k, a } = await opened()
    const rules = useRulesStore()
    const r = (await rules.createRule({ title: 'Magic' })) as string
    const i1 = (await k.createItem({ title: 'T1', about: { type: 'rule', id: r } })) as string
    const i2 = (await k.createItem({ title: 'T2', about: { type: 'entry', id: a } })) as string
    expect(k.brokenAboutIds).toEqual([])
    await c.deleteEntry(a)
    expect(k.brokenAboutIds).toEqual([i2])
    await rules.deleteRule(r)
    expect(k.brokenAboutIds).toEqual([i1, i2])
  })

  it('lookups: by entry and by node; counts hide at zero', async () => {
    const { k, a, b } = await opened()
    const i1 = (await k.createItem({ title: 'One' })) as string
    const i2 = (await k.createItem({ title: 'Two' })) as string
    const x = k.addLearning(i1, { entryId: a, at: node('n1'), forgottenAt: node('n2') })
    const y = k.addLearning(i2, { entryId: a, at: node('n2') })
    k.addLearning(i2, { entryId: b, at: date(3) })
    if (!x.ok || !y.ok) throw new Error('add failed')
    expect(k.learningsOfEntry(a).map((r) => [r.item.id, r.learning.id])).toEqual([
      [i1, x.id],
      [i2, y.id],
    ])
    expect(k.learningsAtNode('t', 'n2').map((r) => [r.learning.id, r.kind])).toEqual([
      [x.id, 'forgets'],
      [y.id, 'learns'],
    ])
    expect(k.eventCountAtNode('t', 'n1')).toBe(1)
    expect(k.eventCountAtNode('t', 'n2')).toBe(2)
    expect(k.eventCountAtNode('t', 'none')).toBe(0)
  })

  it('read-only refuses writes', async () => {
    const { p, k, a } = await opened()
    await p.close()
    const bare = createMemoryProjectIO()
    io = bare
    await createProject(bare, META)
    const m = JSON.parse(bare.files.get('project.json') as string)
    bare.files.set('project.json', JSON.stringify({ ...m, kind: 'other' }))
    const before = new Map(bare.files)
    expect(await p.open('book2')).toBe('opened')
    expect(bare.files).toEqual(before)
    expect(await k.createItem({ title: 'X' })).toBeNull()
    expect(k.updateItem('i', { title: 'x' })).toEqual({ ok: false, reason: 'read-only' })
    expect(await k.deleteItem('i')).toEqual({ ok: false, reason: 'read-only' })
    expect(k.addLearning('i', { entryId: a, at: date(1) })).toEqual({
      ok: false,
      reason: 'read-only',
    })
    expect(k.removeLearning('i', 'l')).toEqual({ ok: false, reason: 'read-only' })
  })
})
