import { describe, expect, it } from 'vitest'
import { createLinkIndex, EVENT_KIND, type Link } from './links'
import { brokenByDeletingNode, brokenByDeletingScenes, brokenByDeletingTimeline, sceneIdsUnder } from './deleteImpact'
import type { ManuscriptNode } from './schemas/manifest'

const L = (id: string, scene: string, tl: string, node: string): Link => ({
  id,
  kind: EVENT_KIND,
  from: { item: scene, block: 'b-' + id },
  to: { item: tl, block: node },
})

function index() {
  const ix = createLinkIndex({ isLive: () => true })
  ix.setLinks('s1', [L('a', 's1', 't1', 'n1'), L('b', 's1', 't1', 'n2')])
  ix.setLinks('s2', [L('c', 's2', 't1', 'n1'), L('d', 's2', 't2', 'n9')])
  return ix
}

const tree: ManuscriptNode[] = [
  {
    id: 'p',
    type: 'part',
    title: 'P',
    children: [
      { id: 'c1', type: 'chapter', title: 'C', children: [{ id: 's1', type: 'scene', title: 'S', path: 'x', children: [] }] },
      { id: 's2', type: 'scene', title: 'S2', path: 'y', children: [] },
    ],
  },
]

describe('delete impact', () => {
  it('counts links owned by the deleted scenes', () => {
    expect(brokenByDeletingScenes(index(), ['s1'])).toBe(2)
    expect(brokenByDeletingScenes(index(), ['s1', 's2'])).toBe(4)
    expect(brokenByDeletingScenes(index(), ['s3'])).toBe(0)
  })
  it('counts links targeting a node', () => {
    expect(brokenByDeletingNode(index(), 't1', 'n1')).toBe(2)
    expect(brokenByDeletingNode(index(), 't1', 'n7')).toBe(0)
  })
  it('counts links targeting any node of a timeline', () => {
    expect(brokenByDeletingTimeline(index(), 't1')).toBe(3)
    expect(brokenByDeletingTimeline(index(), 't2')).toBe(1)
  })
  it('finds the scenes under a part, chapter or scene', () => {
    expect(sceneIdsUnder(tree, 'p')).toEqual(['s1', 's2'])
    expect(sceneIdsUnder(tree, 'c1')).toEqual(['s1'])
    expect(sceneIdsUnder(tree, 's2')).toEqual(['s2'])
    expect(sceneIdsUnder(tree, 'nope')).toEqual([])
  })
})
