import { describe, expect, it } from 'vitest'
import type { Link } from '../project/links'
import { usePositionsForBlock } from './uses'

const ev = (id: string, scene: string, block: string, tl: string, node: string): Link => ({
  id,
  kind: 'event',
  from: { item: scene, block },
  to: { item: tl, block: node },
})

describe('usePositionsForBlock', () => {
  const links: Link[] = [
    ev('l1', 's1', 'b1', 't1', 'n1'),
    ev('l2', 's1', 'b1', 't2', 'n9'),
    ev('l3', 's1', 'b2', 't1', 'n2'),
    ev('l4', 's2', 'b1', 't1', 'n3'),
    { id: 'c', kind: 'codex', from: { item: 's1', block: 'b1' }, to: { item: 'e1' } },
    {
      id: 'k',
      kind: 'knowledge',
      from: { item: 's1', block: 'b1' },
      to: { item: 'k1', entry: 'e1' },
    },
  ]

  it('node positions of the block event links, in link order', () => {
    expect(usePositionsForBlock(links, 's1', 'b1')).toEqual([
      { node: { timelineId: 't1', nodeId: 'n1' } },
      { node: { timelineId: 't2', nodeId: 'n9' } },
    ])
  })

  it('ignores other blocks, other scenes, codex and knowledge links', () => {
    expect(usePositionsForBlock(links, 's1', 'b2')).toEqual([
      { node: { timelineId: 't1', nodeId: 'n2' } },
    ])
  })

  it('no event link: empty', () => {
    expect(usePositionsForBlock(links, 's1', 'zz')).toEqual([])
  })
})
