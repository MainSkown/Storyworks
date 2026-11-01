import { describe, expect, it } from 'vitest'
import { findRehomes, type RehomeInput } from './rehome'
import { EVENT_KIND, type Link } from './links'

const L = (id: string, scene: string, block: string, node = 'n1'): Link => ({
  id,
  kind: EVENT_KIND,
  from: { item: scene, block },
  to: { item: 't1', block: node },
})

const input = (
  links: Record<string, Link[]>,
  blocks: Record<string, string[]>,
  live: string[] = Object.keys(blocks),
): RehomeInput => ({
  links: new Map(Object.entries(links)),
  blocks: new Map(Object.entries(blocks).map(([k, v]) => [k, new Set(v)])),
  isLive: (id) => live.includes(id),
})

describe('findRehomes', () => {
  it('moves a link whose block now lives in exactly one other scene', () => {
    const r = findRehomes(input({ s1: [L('l1', 's1', 'b1')] }, { s1: [], s2: ['b1'] }))
    expect(r.moves).toEqual([{ from: 's1', to: 's2', link: L('l1', 's2', 'b1') }])
    expect(r.dupes).toEqual([])
  })

  it('leaves a link whose block was deleted outright', () => {
    const r = findRehomes(input({ s1: [L('l1', 's1', 'b1')] }, { s1: [], s2: [] }))
    expect(r).toEqual({ moves: [], dupes: [] })
  })

  it('leaves a link when the block id is in several other scenes', () => {
    const r = findRehomes(input({ s1: [L('l1', 's1', 'b1')] }, { s1: [], s2: ['b1'], s3: ['b1'] }))
    expect(r.moves).toEqual([])
  })

  it('ignores trashed destination scenes', () => {
    const r = findRehomes(input({ s1: [L('l1', 's1', 'b1')] }, { s1: [], s2: ['b1'] }, ['s1']))
    expect(r.moves).toEqual([])
  })

  it('does not touch a link that still has its block', () => {
    const r = findRehomes(input({ s1: [L('l1', 's1', 'b1')] }, { s1: ['b1'], s2: ['b1'] }))
    expect(r).toEqual({ moves: [], dupes: [] })
  })

  it('does not move links of an owner whose blocks are unknown or that is trashed', () => {
    expect(findRehomes(input({ s1: [L('l1', 's1', 'b1')] }, { s2: ['b1'] }, ['s2'])).moves).toEqual(
      [],
    )
    expect(
      findRehomes(input({ s1: [L('l1', 's1', 'b1')] }, { s1: [], s2: ['b1'] }, ['s2'])).moves,
    ).toEqual([])
  })

  it('drops the source copy when the destination already has the same block + node link', () => {
    const r = findRehomes(
      input({ s1: [L('l1', 's1', 'b1')], s2: [L('l2', 's2', 'b1')] }, { s1: [], s2: ['b1'] }),
    )
    expect(r.moves).toEqual([])
    expect(r.dupes).toEqual([{ owner: 's1', linkId: 'l1' }])
  })

  it('dedupes a crash duplicate (same link id in two scenes), keeping the copy whose scene has the block', () => {
    const r = findRehomes(
      input({ s1: [L('l1', 's1', 'b1')], s2: [L('l1', 's2', 'b1')] }, { s1: [], s2: ['b1'] }),
    )
    expect(r.dupes).toEqual([{ owner: 's1', linkId: 'l1' }])
    expect(r.moves).toEqual([])
  })

  it('is idempotent: applying the result and running again finds nothing', () => {
    const inp = input(
      { s1: [L('l1', 's1', 'b1'), L('l2', 's1', 'b2')] },
      { s1: ['b2'], s2: ['b1'] },
    )
    const r = findRehomes(inp)
    expect(r.moves).toHaveLength(1)
    const links = new Map(inp.links)
    links.set('s1', [L('l2', 's1', 'b2')])
    links.set('s2', [L('l1', 's2', 'b1')])
    expect(findRehomes({ ...inp, links })).toEqual({ moves: [], dupes: [] })
  })
})

// Runs on every scene save; guards against accidental O(links^2) work.
it('handles 5000 links over 500 scenes quickly, even when all are orphaned', () => {
  const links: Record<string, Link[]> = {}
  const blocks: Record<string, string[]> = {}
  for (let s = 0; s < 500; s++) {
    links[`s${s}`] = Array.from({ length: 10 }, (_, k) => L(`s${s}l${k}`, `s${s}`, `s${s}b${k}`))
    blocks[`s${s}`] = []
  }
  const t0 = performance.now()
  const r = findRehomes(input(links, blocks))
  expect(performance.now() - t0).toBeLessThan(1000)
  expect(r.moves).toEqual([])
})
