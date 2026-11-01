import { describe, expect, it } from 'vitest'
import type { ManuscriptNode } from './schemas/manifest'
import type { Scene } from './schemas/scene'
import { dropSlot, filterByStatus, keyboardMove, moveTo } from './tree'

type Status = Scene['status']

const n = (id: string, type: ManuscriptNode['type'], children: ManuscriptNode[] = []) =>
  ({ id, type, title: id, children }) as ManuscriptNode

/** part p [ch1 [a b c], ch2 [x]], root chapter ch3 [y], root scene r */
const book = () => [
  n('p', 'part', [
    n('ch1', 'chapter', [n('a', 'scene'), n('b', 'scene'), n('c', 'scene')]),
    n('ch2', 'chapter', [n('x', 'scene')]),
  ]),
  n('ch3', 'chapter', [n('y', 'scene')]),
  n('r', 'scene'),
]

const kids = (nodes: ManuscriptNode[], id: string): string[] => {
  for (const node of nodes) {
    if (node.id === id) return node.children.map((c) => c.id)
    const found = kids(node.children, id)
    if (found.length) return found
  }
  return []
}
const rootIds = (nodes: ManuscriptNode[]) => nodes.map((x) => x.id)

describe('moveTo', () => {
  it('moves a scene into another chapter at the given index', () => {
    const out = moveTo(book(), 'a', 'ch2', 0)
    expect(kids(out!, 'ch2')).toEqual(['a', 'x'])
    expect(kids(out!, 'ch1')).toEqual(['b', 'c'])
  })

  it('moves a chapter out of its part to the root', () => {
    const out = moveTo(book(), 'ch2', null, 1)
    expect(rootIds(out!)).toEqual(['p', 'ch2', 'ch3', 'r'])
  })

  it('moves a root scene under a part', () => {
    const out = moveTo(book(), 'r', 'p', 2)
    expect(kids(out!, 'p')).toEqual(['ch1', 'ch2', 'r'])
  })

  it('moves a subtree with its children', () => {
    const out = moveTo(book(), 'ch1', 'p', 1)
    expect(kids(out!, 'p')).toEqual(['ch2', 'ch1'])
    expect(kids(out!, 'ch1')).toEqual(['a', 'b', 'c'])
  })

  it('index is the final position after removal when reordering in the same parent', () => {
    expect(kids(moveTo(book(), 'a', 'ch1', 2)!, 'ch1')).toEqual(['b', 'c', 'a'])
    expect(kids(moveTo(book(), 'c', 'ch1', 0)!, 'ch1')).toEqual(['c', 'a', 'b'])
    expect(kids(moveTo(book(), 'b', 'ch1', 1)!, 'ch1')).toEqual(['a', 'b', 'c'])
  })

  it('reorders at the root', () => {
    const out = moveTo(book(), 'r', null, 0)
    expect(rootIds(out!)).toEqual(['r', 'p', 'ch3'])
  })

  it('does not mutate its input', () => {
    const input = book()
    const copy = structuredClone(input)
    moveTo(input, 'a', 'ch2', 0)
    expect(input).toEqual(copy)
  })

  it('rejects moving a node into itself', () => {
    expect(moveTo(book(), 'p', 'p', 0)).toBeNull()
  })

  it('rejects moving a node into its own descendant', () => {
    expect(moveTo(book(), 'p', 'ch1', 0)).toBeNull()
  })

  it('rejects a scene under a scene', () => {
    expect(moveTo(book(), 'a', 'b', 0)).toBeNull()
  })

  it('rejects a part under a chapter or a part', () => {
    expect(moveTo(book(), 'p', 'ch3', 0)).toBeNull()
    const two = [n('p1', 'part'), n('p2', 'part')]
    expect(moveTo(two, 'p2', 'p1', 0)).toBeNull()
  })

  it('rejects a chapter under a chapter', () => {
    expect(moveTo(book(), 'ch3', 'ch1', 0)).toBeNull()
  })

  it('rejects an unknown node or parent', () => {
    expect(moveTo(book(), 'nope', null, 0)).toBeNull()
    expect(moveTo(book(), 'a', 'nope', 0)).toBeNull()
  })
})

describe('filterByStatus', () => {
  const statusOf = (id: string): Status =>
    ({ a: 'draft', b: 'final', c: 'idea', x: 'draft', y: 'final', r: 'draft' })[id] as Status

  it('keeps matching scenes and their ancestors only', () => {
    const out = filterByStatus(book(), statusOf, new Set<Status>(['final']))
    expect(rootIds(out)).toEqual(['p', 'ch3'])
    expect(kids(out, 'p')).toEqual(['ch1'])
    expect(kids(out, 'ch1')).toEqual(['b'])
    expect(kids(out, 'ch3')).toEqual(['y'])
  })

  it('keeps a matching root scene', () => {
    const out = filterByStatus(book(), statusOf, new Set<Status>(['draft']))
    expect(rootIds(out)).toContain('r')
  })

  it('drops chapters and parts with no matching scene', () => {
    const out = filterByStatus(book(), statusOf, new Set<Status>(['idea']))
    expect(rootIds(out)).toEqual(['p'])
    expect(kids(out, 'p')).toEqual(['ch1'])
    expect(kids(out, 'ch1')).toEqual(['c'])
  })

  it('returns nothing when no scene matches', () => {
    expect(filterByStatus(book(), statusOf, new Set<Status>(['revising']))).toEqual([])
  })

  it('does not mutate its input', () => {
    const input = book()
    const copy = structuredClone(input)
    filterByStatus(input, statusOf, new Set<Status>(['final']))
    expect(input).toEqual(copy)
  })
})

describe('keyboardMove', () => {
  it('up and down swap with the neighbour and stop at the edges', () => {
    expect(keyboardMove(book(), 'b', 'up')).toEqual({ parentId: 'ch1', index: 0 })
    expect(keyboardMove(book(), 'b', 'down')).toEqual({ parentId: 'ch1', index: 2 })
    expect(keyboardMove(book(), 'a', 'up')).toBeNull()
    expect(keyboardMove(book(), 'c', 'down')).toBeNull()
  })

  it('indent nests under the previous sibling as its last child', () => {
    expect(keyboardMove(book(), 'ch3', 'in')).toEqual({ parentId: 'p', index: 2 })
    expect(keyboardMove(book(), 'r', 'in')).toEqual({ parentId: 'ch3', index: 1 })
    expect(keyboardMove(book(), 'ch2', 'in')).toBeNull() // chapter under chapter
    expect(keyboardMove(book(), 'a', 'in')).toBeNull() // first child, no previous sibling
  })

  it('outdent moves right after the parent', () => {
    expect(keyboardMove(book(), 'b', 'out')).toEqual({ parentId: 'p', index: 1 })
    expect(keyboardMove(book(), 'ch2', 'out')).toEqual({ parentId: null, index: 1 })
    expect(keyboardMove(book(), 'p', 'out')).toBeNull()
  })
})

describe('dropSlot', () => {
  it('before and after a row use the row parent, adjusted for removal in the same parent', () => {
    expect(dropSlot(book(), 'a', 'c', 'before')).toEqual({ parentId: 'ch1', index: 1 })
    expect(dropSlot(book(), 'a', 'c', 'after')).toEqual({ parentId: 'ch1', index: 2 })
    expect(dropSlot(book(), 'c', 'a', 'before')).toEqual({ parentId: 'ch1', index: 0 })
    expect(dropSlot(book(), 'x', 'a', 'before')).toEqual({ parentId: 'ch1', index: 0 })
  })

  it('inside appends as the last child', () => {
    expect(dropSlot(book(), 'a', 'ch2', 'inside')).toEqual({ parentId: 'ch2', index: 1 })
  })

  it('rejects invalid nesting, own descendants, itself and no-ops', () => {
    expect(dropSlot(book(), 'a', 'b', 'inside')).toBeNull()
    expect(dropSlot(book(), 'p', 'ch1', 'inside')).toBeNull()
    expect(dropSlot(book(), 'a', 'a', 'before')).toBeNull()
    expect(dropSlot(book(), 'a', 'b', 'before')).toBeNull()
    expect(dropSlot(book(), 'b', 'a', 'after')).toBeNull()
  })
})
