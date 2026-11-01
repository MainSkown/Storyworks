import { describe, expect, it } from 'vitest'
import type { ManuscriptNode } from './schemas/manifest'
import { crossSlot, groupScenes } from './corkboard'
import { moveTo } from './tree'

const n = (id: string, type: ManuscriptNode['type'], children: ManuscriptNode[] = []) =>
  ({ id, type, title: id, children }) as ManuscriptNode

/** root scene r0, part p [scene s0, ch1 [a b], ch2 [], scene s1], chapter ch3 [y], root scene r1 */
const book = () => [
  n('r0', 'scene'),
  n('p', 'part', [
    n('s0', 'scene'),
    n('ch1', 'chapter', [n('a', 'scene'), n('b', 'scene')]),
    n('ch2', 'chapter'),
    n('s1', 'scene'),
  ]),
  n('ch3', 'chapter', [n('y', 'scene')]),
  n('r1', 'scene'),
]

describe('groupScenes', () => {
  it('lists sections in tree order with headings only on containers', () => {
    const out = groupScenes(book()).map((s) => [
      s.parentId,
      s.heading?.id ?? null,
      s.scenes.map((c) => c.node.id),
    ])
    expect(out).toEqual([
      [null, null, ['r0']],
      ['p', 'p', ['s0']],
      ['ch1', 'ch1', ['a', 'b']],
      ['ch2', 'ch2', []],
      ['p', null, ['s1']],
      ['ch3', 'ch3', ['y']],
      [null, null, ['r1']],
    ])
  })

  it('records each scene index among its parent children', () => {
    const idx = groupScenes(book()).flatMap((s) => s.scenes.map((c) => [c.node.id, c.index]))
    expect(idx).toEqual([
      ['r0', 0],
      ['s0', 0],
      ['a', 0],
      ['b', 1],
      ['s1', 3],
      ['y', 0],
      ['r1', 3],
    ])
  })

  it('returns nothing for an empty book', () => {
    expect(groupScenes([])).toEqual([])
  })
})

describe('crossSlot', () => {
  it('moves to the end of the previous chapter', () => {
    const tree = book()
    const slot = crossSlot(tree, 'y', 'prev')
    expect(slot).toEqual({ parentId: 'p', index: 4 })
    expect(moveTo(tree, 'y', slot!.parentId, slot!.index)).not.toBeNull()
  })

  it('moves to the start of the next chapter, including an empty one', () => {
    expect(crossSlot(book(), 'b', 'next')).toEqual({ parentId: 'ch2', index: 0 })
    expect(crossSlot(book(), 'a', 'prev')).toEqual({ parentId: 'p', index: 1 })
  })

  it('has no target at the very start or end', () => {
    expect(crossSlot(book(), 'r0', 'prev')).toBeNull()
    expect(crossSlot(book(), 'r1', 'next')).toBeNull()
  })

  it('returns null for an unknown scene', () => {
    expect(crossSlot(book(), 'nope', 'next')).toBeNull()
  })
})
