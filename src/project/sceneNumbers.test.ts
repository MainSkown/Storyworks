import { describe, expect, it } from 'vitest'
import { sceneHeadingIds, sceneNumbers } from './sceneNumbers'
import type { ManuscriptNode } from './schemas/manifest'

const scene = (id: string): ManuscriptNode => ({ id, type: 'scene', title: id, children: [] })
const seq = (id: string, ...children: ManuscriptNode[]): ManuscriptNode => ({
  id,
  type: 'chapter',
  title: id,
  children,
})
const heads = (o: Record<string, string[]>) => new Map(Object.entries(o))

describe('sceneHeadingIds', () => {
  it('lists scene heading block ids in document order, ignoring other blocks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'sceneHeading', attrs: { id: 'h1' } },
        { type: 'action', attrs: { id: 'a1' } },
        { type: 'sceneHeading', attrs: { id: 'h2' } },
        { type: 'paragraph', attrs: { id: 'p' } },
      ],
    }
    expect(sceneHeadingIds(doc)).toEqual(['h1', 'h2'])
  })

  it('skips headings without an id and survives odd input', () => {
    expect(sceneHeadingIds({ type: 'doc', content: [{ type: 'sceneHeading' }] })).toEqual([])
    expect(sceneHeadingIds(null)).toEqual([])
    expect(sceneHeadingIds({})).toEqual([])
  })
})

describe('sceneNumbers', () => {
  it('numbers headings through all sequences in tree order', () => {
    const tree = [seq('s1', scene('a'), scene('b')), seq('s2', scene('c'))]
    const n = sceneNumbers(tree, heads({ a: ['a1', 'a2'], b: ['b1'], c: ['c1'] }))
    expect([...n.byBlock]).toEqual([
      ['a1', 1],
      ['a2', 2],
      ['b1', 3],
      ['c1', 4],
    ])
    expect(n.byItem.get('a')).toBe(1)
    expect(n.byItem.get('b')).toBe(3)
    expect(n.byItem.get('c')).toBe(4)
  })

  it('follows tree order, not the order of the index', () => {
    const tree = [seq('s', scene('a'), scene('b'))]
    const n = sceneNumbers(tree, heads({ b: ['b1'], a: ['a1'] }))
    expect(n.byBlock.get('a1')).toBe(1)
    expect(n.byBlock.get('b1')).toBe(2)
  })

  it('a scene that is not in the tree (trashed) is skipped', () => {
    const n = sceneNumbers([seq('s', scene('b'))], heads({ a: ['a1'], b: ['b1'] }))
    expect(n.byBlock.has('a1')).toBe(false)
    expect(n.byBlock.get('b1')).toBe(1)
  })

  it('a new heading in the middle renumbers later ones', () => {
    const tree = [seq('s', scene('a'), scene('b'))]
    const before = sceneNumbers(tree, heads({ a: ['a1'], b: ['b1'] }))
    const after = sceneNumbers(tree, heads({ a: ['a1', 'new'], b: ['b1'] }))
    expect(before.byBlock.get('b1')).toBe(2)
    expect(after.byBlock.get('new')).toBe(2)
    expect(after.byBlock.get('b1')).toBe(3)
    expect(after.byBlock.get('a1')).toBe(1)
  })

  it('an item without a heading is unnumbered and takes no number', () => {
    const tree = [seq('s', scene('a'), scene('empty'), scene('b'))]
    const n = sceneNumbers(tree, heads({ a: ['a1'], b: ['b1'] }))
    expect(n.byItem.has('empty')).toBe(false)
    expect(n.byBlock.get('b1')).toBe(2)
  })

  it('two headings in one item: the item shows the first', () => {
    const n = sceneNumbers(
      [seq('s', scene('a'), scene('b'))],
      heads({ a: ['a1', 'a2'], b: ['b1'] }),
    )
    expect(n.byItem.get('a')).toBe(1)
    expect(n.byBlock.get('a2')).toBe(2)
  })

  it('a sequence shows the number of its first heading', () => {
    const tree = [seq('s1', scene('x')), seq('s2', scene('e'), scene('c'))]
    const n = sceneNumbers(tree, heads({ x: ['x1'], c: ['c1'] }))
    expect(n.byItem.get('s1')).toBe(1)
    expect(n.byItem.get('s2')).toBe(2)
  })

  it('an empty tree gives empty maps', () => {
    const n = sceneNumbers([], heads({}))
    expect(n.byBlock.size).toBe(0)
    expect(n.byItem.size).toBe(0)
  })

  it('1500 scenes with 3 headings each stay fast', () => {
    const scenes = Array.from({ length: 1500 }, (_, i) => scene(`s${i}`))
    const tree = Array.from({ length: 30 }, (_, i) =>
      seq(`q${i}`, ...scenes.slice(i * 50, i * 50 + 50)),
    )
    const index = new Map(scenes.map((s) => [s.id, [`${s.id}a`, `${s.id}b`, `${s.id}c`]]))
    const t = performance.now()
    const n = sceneNumbers(tree, index)
    expect(performance.now() - t).toBeLessThan(100)
    expect(n.byBlock.size).toBe(4500)
    expect(n.byBlock.get('s1499c')).toBe(4500)
  })
})
