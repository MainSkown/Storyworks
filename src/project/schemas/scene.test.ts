import { describe, expect, it } from 'vitest'
import { sceneSchema } from './scene'

const block = (id: string, children: unknown[] = []) => ({
  type: 'paragraph',
  attrs: { id },
  content: children,
})
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks })
const scene = (content: unknown) => ({ version: 1, id: 's1', title: 'Scene', content })

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
