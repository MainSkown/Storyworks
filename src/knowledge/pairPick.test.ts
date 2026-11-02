import { describe, expect, it } from 'vitest'
import { filterItems, groupUsesByPair, learnerPositions } from './pairPick'
import type { Link } from '../project/links'

const at = (n: string) => ({ node: { timelineId: 't', nodeId: n } })
const items = [
  { id: 'a', title: 'The Secret', tags: ['plot'], learnings: [] },
  { id: 'b', title: 'Harbor map', tags: ['Place'], learnings: [] },
]

describe('knowledge pair picker', () => {
  it('filters items by title or tag, ignoring case', () => {
    expect(filterItems(items, '').map((i) => i.id)).toEqual(['a', 'b'])
    expect(filterItems(items, ' secret ').map((i) => i.id)).toEqual(['a'])
    expect(filterItems(items, 'place').map((i) => i.id)).toEqual(['b'])
    expect(filterItems(items, 'zzz')).toEqual([])
  })

  it('collects the positions where each entry learns the item', () => {
    const m = learnerPositions({
      learnings: [
        { entryId: 'x', at: at('1') },
        { entryId: 'y', at: at('2') },
        { entryId: 'x', at: at('3') },
      ],
    })
    expect(m.get('x')).toEqual([at('1'), at('3')])
    expect(m.get('y')).toEqual([at('2')])
    expect(m.has('z')).toBe(false)
  })
})

describe('uses of a scene', () => {
  const link = (id: string, scene: string, block: string, item: string, entry: string, kind = 'knowledge'): Link => ({
    id, kind, from: { item: scene, block }, to: { item, entry },
  })

  it('groups knowledge links of the scene by pair and ignores other kinds and scenes', () => {
    const links = [
      link('1', 's', 'a', 'k', 'x'),
      link('2', 's', 'b', 'k', 'x'),
      link('3', 's', 'a', 'k', 'y'),
      link('4', 'other', 'a', 'k', 'x'),
      link('5', 's', 'a', 'k', 'x', 'event'),
    ]
    expect(groupUsesByPair(links, 's')).toEqual([
      { itemId: 'k', entryId: 'x', blocks: 2 },
      { itemId: 'k', entryId: 'y', blocks: 1 },
    ])
  })
})
