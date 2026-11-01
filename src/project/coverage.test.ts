import { describe, expect, it } from 'vitest'
import { coverage } from './coverage'
import { EVENT_KIND, type Link } from './links'

const L = (id: string, scene: string, node: string): Link => ({
  id,
  kind: EVENT_KIND,
  from: { item: scene, block: 'b-' + id },
  to: { item: 't1', block: node },
})
const scenes = [
  { id: 's1', wordCount: 10 },
  { id: 's2', wordCount: 10 },
]

describe('coverage', () => {
  it('lists nodes without passages and scenes without links', () => {
    const r = coverage({
      nodeIds: ['n1', 'n2'],
      scenes,
      links: [L('l1', 's1', 'n1')],
      isBroken: () => false,
    })
    expect(r).toEqual({ nodesWithoutPassages: ['n2'], scenesWithoutLinks: ['s2'] })
  })

  it('broken links do not count on either side', () => {
    const r = coverage({
      nodeIds: ['n1'],
      scenes: [scenes[0]],
      links: [L('l1', 's1', 'n1')],
      isBroken: () => true,
    })
    expect(r).toEqual({ nodesWithoutPassages: ['n1'], scenesWithoutLinks: ['s1'] })
  })

  it('excludes scenes with no text', () => {
    const r = coverage({
      nodeIds: [],
      scenes: [{ id: 's9', wordCount: 0 }],
      links: [],
      isBroken: () => false,
    })
    expect(r.scenesWithoutLinks).toEqual([])
  })

  it('a scene with one unbroken link among broken ones is covered', () => {
    const bad = L('l1', 's1', 'n1')
    const r = coverage({
      nodeIds: ['n1', 'n2'],
      scenes: [scenes[0]],
      links: [bad, L('l2', 's1', 'n2')],
      isBroken: (l) => l.id === bad.id,
    })
    expect(r).toEqual({ nodesWithoutPassages: ['n1'], scenesWithoutLinks: [] })
  })

  it('empty book gives empty lists', () => {
    expect(coverage({ nodeIds: [], scenes: [], links: [], isBroken: () => false })).toEqual({
      nodesWithoutPassages: [],
      scenesWithoutLinks: [],
    })
  })
})
