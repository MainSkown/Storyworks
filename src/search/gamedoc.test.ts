import { describe, expect, it } from 'vitest'
import { createIndex } from './index'
import { search } from './query'
import { createAreaSync } from './sync'
import { glossaryUnits, mechanicUnits, overviewUnits } from './units'

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const hits = (ix: ReturnType<typeof createIndex>, q: string) =>
  search(ix, q).groups.flatMap((g) => g.hits.map((h) => h.id))
const mech = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  summary: '',
  description: doc(''),
  parameters: [] as { id: string; name: string; value: string }[],
  ...over,
})

describe('game document search', () => {
  it('finds a mechanic by title, summary, description and parameter, and drops it when trashed', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'gamedoc')
    const m = mech('m1', {
      title: 'Stamina',
      summary: 'Limits sprinting',
      description: doc('Drains while running'),
      parameters: [{ id: 'p', name: 'Regen', value: '5 per second' }],
    })
    s.sync(mechanicUnits([m]))
    for (const q of ['stamina', 'sprinting', 'drains', 'regen', 'per second']) expect(hits(ix, q)).toEqual(['m1'])
    s.sync(mechanicUnits([]))
    expect(hits(ix, 'stamina')).toEqual([])
  })

  it('finds the overview text, and glossary terms and definitions', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'gamedoc')
    s.sync([
      ...overviewUnits(doc('A heist among clockwork pigeons'), 'Overview'),
      ...glossaryUnits([{ id: 'g1', term: 'Gold', definition: 'Common currency' }]),
    ])
    expect(hits(ix, 'clockwork')).toEqual(['game-overview'])
    expect(hits(ix, 'gold')).toEqual(['g1'])
    expect(hits(ix, 'currency')).toEqual(['g1'])
  })

  it('an edited mechanic replaces its old text', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'gamedoc')
    s.sync(mechanicUnits([mech('m1', { description: doc('old words') })]))
    s.sync(mechanicUnits([mech('m1', { description: doc('fresh words') })]))
    expect(hits(ix, 'old')).toEqual([])
    expect(hits(ix, 'fresh')).toEqual(['m1'])
  })
})
