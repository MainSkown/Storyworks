import { describe, expect, it } from 'vitest'
import { createLinkIndex, EVENT_KIND, type Link } from './links'
import {
  brokenByDeletingNode,
  brokenByDeletingScenes,
  brokenByDeletingTimeline,
  knowledgeImpactOfNode,
  relationImpactOfEntry,
  relationImpactOfNode,
  sceneIdsUnder,
} from './deleteImpact'
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
      {
        id: 'c1',
        type: 'chapter',
        title: 'C',
        children: [{ id: 's1', type: 'scene', title: 'S', path: 'x', children: [] }],
      },
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

describe('relations impact', () => {
  const rel = (id: string, fromId: string, toId: string, nodeId?: string) => ({
    version: 1 as const,
    id,
    fromId,
    toId,
    typeId: 't',
    note: {},
    nodeRef: nodeId ? { timelineId: 'tl', nodeId } : null,
  })
  const grp = (id: string, memberIds: string[]) => ({
    version: 1 as const,
    id,
    name: id,
    color: '#000',
    memberIds,
  })
  it('lists the relationships and groups touching an entry', () => {
    const r = [rel('r1', 'a', 'b'), rel('r2', 'c', 'a'), rel('r3', 'b', 'c')]
    const g = [grp('g1', ['a', 'b']), grp('g2', ['c'])]
    const out = relationImpactOfEntry('a', r, g)
    expect(out.relationships.map((x) => x.id)).toEqual(['r1', 'r2'])
    expect(out.groups.map((x) => x.id)).toEqual(['g1'])
    expect(relationImpactOfEntry('z', r, g)).toEqual({ relationships: [], groups: [] })
  })
  it('lists relationships linked to a node', () => {
    const r = [rel('r1', 'a', 'b', 'n1'), rel('r2', 'a', 'b', 'n2'), rel('r3', 'a', 'b')]
    expect(relationImpactOfNode('tl', 'n1', r).map((x) => x.id)).toEqual(['r1'])
    expect(relationImpactOfNode('other', 'n1', r)).toEqual([])
  })
})

describe('knowledge impact', () => {
  const node = (nodeId: string, timelineId = 'tl') => ({ node: { timelineId, nodeId } })
  const item = (id: string, learnings: Record<string, unknown>[]) =>
    ({ version: 1, id, title: id, description: {}, tags: [], about: null, learnings }) as never
  const l = (id: string, at: unknown, forgottenAt: unknown = null) => ({
    id,
    entryId: 'e',
    at,
    note: '',
    forgottenAt,
    revealedIn: null,
  })
  it('counts learn and forget events placed on the node', () => {
    const items = [
      item('k1', [l('a', node('n1'), node('n2')), l('b', node('n2'))]),
      item('k2', [l('c', node('n1', 'other'))]),
    ]
    expect(knowledgeImpactOfNode('tl', 'n1', items)).toBe(1)
    expect(knowledgeImpactOfNode('tl', 'n2', items)).toBe(2)
    expect(knowledgeImpactOfNode('tl', 'n9', items)).toBe(0)
  })
})
