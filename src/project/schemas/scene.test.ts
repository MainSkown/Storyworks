import { describe, expect, it } from 'vitest'
import { sceneSchema, SCENE_VERSION } from './scene'

const block = (id: string, children: unknown[] = []) => ({
  type: 'paragraph',
  attrs: { id },
  content: children,
})
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks })
const scene = (content: unknown) => ({ version: SCENE_VERSION, id: 's1', title: 'Scene', content })

describe('scene schema', () => {
  it('accepts a scene with unique block ids', () => {
    expect(sceneSchema.safeParse(scene(doc(block('a'), block('b')))).success).toBe(true)
  })
  it('fills defaults for optional fields', () => {
    const r = sceneSchema.safeParse(scene(doc(block('a'))))
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.synopsis).toBe('')
      expect(r.data.comments).toEqual([])
      expect(r.data.links).toEqual([])
    }
  })
  it('rejects duplicate block ids', () => {
    expect(sceneSchema.safeParse(scene(doc(block('a'), block('a')))).success).toBe(false)
  })
  it('rejects a duplicate id nested deeper in the tree', () => {
    const nested = doc(block('a'), { type: 'blockquote', content: [block('a')] })
    expect(sceneSchema.safeParse(scene(nested)).success).toBe(false)
  })
  it('nodes without an id attr do not count as duplicates', () => {
    const d = doc({ type: 'paragraph' }, { type: 'paragraph' })
    expect(sceneSchema.safeParse(scene(d)).success).toBe(true)
  })
  it('rejects a title that is not a string', () => {
    const r = sceneSchema.safeParse({ ...scene(doc()), title: 3 })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].path).toEqual(['title'])
  })
  it('rejects a missing id', () => {
    const rest: Record<string, unknown> = scene(doc())
    delete rest.id
    expect(sceneSchema.safeParse(rest).success).toBe(false)
  })
})

describe('scene schema v2', () => {
  const v2 = (extra: Record<string, unknown> = {}) => ({
    version: 2,
    id: 's1',
    title: 'Scene',
    content: doc(block('a')),
    ...extra,
  })
  const comment = { id: 'c1', text: 'check this', createdAt: '2026-01-01T00:00:00.000Z', resolved: false }

  it('is version 2', () => {
    expect(SCENE_VERSION).toBe(2)
  })

  it('defaults todos to an empty list', () => {
    const r = sceneSchema.safeParse(v2())
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.todos).toEqual([])
  })

  it('accepts todos and comments of the right shape', () => {
    const r = sceneSchema.safeParse(
      v2({ todos: [{ id: 't1', text: 'fix', done: false }], comments: [comment] }),
    )
    expect(r.success).toBe(true)
  })

  it('rejects a todo with a non-boolean done', () => {
    const todos = [{ id: 't1', text: 'fix', done: 'no' }]
    expect(sceneSchema.safeParse(v2({ todos })).success).toBe(false)
  })

  it('rejects a todo without text', () => {
    expect(sceneSchema.safeParse(v2({ todos: [{ id: 't1', done: false }] })).success).toBe(false)
  })

  it('rejects a comment missing text, createdAt or resolved', () => {
    for (const key of ['text', 'createdAt', 'resolved']) {
      const partial: Record<string, unknown> = { ...comment }
      delete partial[key]
      expect(sceneSchema.safeParse(v2({ comments: [partial] })).success).toBe(false)
    }
  })

  it('rejects an unknown key on a comment', () => {
    expect(sceneSchema.safeParse(v2({ comments: [{ ...comment, extra: 1 }] })).success).toBe(false)
  })

  it('rejects a v1 file', () => {
    expect(sceneSchema.safeParse({ ...v2(), version: 1 }).success).toBe(false)
  })
})
