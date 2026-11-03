import { describe, expect, it } from 'vitest'
import { createIndex } from './index'
import { search } from './query'
import { createAreaSync } from './sync'
import { timelineUnits } from './units'

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const node = (id: string, title: string, text = '') => ({ id, title, description: doc(text) })
const hits = (ix: ReturnType<typeof createIndex>, q: string) =>
  search(ix, q).groups.flatMap((g) => g.hits.map((h) => h.id))

describe('timelineUnits', () => {
  it('finds a node by description, drops it when deleted, brings it back when restored', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'timelines')
    const a = node('n1', 'Landing', 'The lantern is lit')
    const t = (nodes: ReturnType<typeof node>[]) => [{ id: 't1', name: 'Main', nodes }]
    s.sync(timelineUnits(t([a])))
    expect(hits(ix, 'lantern')).toEqual(['n1'])
    s.sync(timelineUnits(t([])))
    expect(hits(ix, 'lantern')).toEqual([])
    s.sync(timelineUnits(t([a])))
    expect(hits(ix, 'lantern')).toEqual(['n1'])
  })

  it('removes the nodes with their timeline', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'timelines')
    s.sync(timelineUnits([{ id: 't1', name: 'Main', nodes: [node('n1', 'Landing')] }]))
    s.sync(timelineUnits([]))
    expect(hits(ix, 'landing')).toEqual([])
  })

  it('renames a timeline without losing its nodes', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'timelines')
    const n = node('n1', 'Landing')
    s.sync(timelineUnits([{ id: 't1', name: 'Main', nodes: [n] }]))
    s.sync(timelineUnits([{ id: 't1', name: 'Past', nodes: [n] }]))
    expect(hits(ix, 'past')).toEqual(['t1'])
    expect(hits(ix, 'landing')).toEqual(['n1'])
  })
})
