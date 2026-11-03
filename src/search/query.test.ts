import { describe, expect, it } from 'vitest'
import { createIndex, type SearchIndex } from './index'
import { search } from './query'

const parts = (...t: string[]) => t.map((text, i) => ({ text, blockId: `b${i}` }))

function sample(): SearchIndex {
  const ix = createIndex()
  ix.upsert('manuscript', { id: 's1', kind: 'scene', title: 'Docks', parts: parts('Anna waited at the pier.') })
  ix.upsert('manuscript', { id: 's2', kind: 'scene', title: 'Anna returns', parts: parts('Nothing.') })
  ix.upsert('codex', { id: 'e1', kind: 'entry', title: 'Captain', aliases: ['Anna the Red'], parts: parts('Old sailor.') })
  ix.upsert('rules', { id: 'r1', kind: 'rule', title: 'Tides', parts: parts('Anna knows them.') })
  return ix
}

describe('search', () => {
  it('finds by content', () => {
    const r = search(sample(), 'pier')
    expect(r.groups.map((g) => g.hits[0].id)).toEqual(['s1'])
  })

  it('finds by alias and says so', () => {
    const hit = search(sample(), 'the red').groups[0].hits[0]
    expect([hit.id, hit.field]).toEqual(['e1', 'alias'])
  })

  it('groups results by area', () => {
    const r = search(sample(), 'anna')
    expect(r.groups.map((g) => g.area)).toEqual(['manuscript', 'codex', 'rules'])
  })

  it('finds Polish text typed without diacritics', () => {
    const ix = createIndex()
    ix.upsert('manuscript', { id: 's', kind: 'scene', title: 'x', parts: parts('Mieszkał w Łodzi, nad Łódką.') })
    expect(search(ix, 'lodzi').groups).toHaveLength(1)
  })

  it('finds text without diacritics when searching with them', () => {
    const ix = createIndex()
    ix.upsert('manuscript', { id: 's', kind: 'scene', title: 'x', parts: parts('Zazolc gesla jazn') })
    expect(search(ix, 'Zażółć').groups).toHaveLength(1)
  })

  it('is case-insensitive', () => {
    expect(search(sample(), 'PIER').groups).toHaveLength(1)
  })

  it('snippet offsets point at the match in the original text', () => {
    const ix = createIndex()
    ix.upsert('manuscript', { id: 's', kind: 'scene', title: 't', parts: parts('Wrócił z Łódź do domu.') })
    const h = search(ix, 'lodz').groups[0].hits[0]
    expect(h.snippet.slice(h.matchStart, h.matchEnd)).toBe('Łódź')
  })

  it('a long block gives a short snippet around the match, offsets still right', () => {
    const long = `${'word '.repeat(100)}NEEDLE${' tail'.repeat(100)}`
    const ix = createIndex()
    ix.upsert('manuscript', { id: 's', kind: 'scene', title: 't', parts: parts(long) })
    const h = search(ix, 'needle').groups[0].hits[0]
    expect(h.snippet.length).toBeLessThan(200)
    expect(h.snippet.slice(h.matchStart, h.matchEnd)).toBe('NEEDLE')
  })

  it('returns the block id of a body hit and none for a title hit', () => {
    const r = search(sample(), 'anna').groups[0].hits
    expect(r.find((h) => h.id === 's1')?.blockId).toBe('b0')
    expect(r.find((h) => h.id === 's2')?.blockId).toBeUndefined()
  })

  it('ranks title hits above body hits, then document order', () => {
    const ix = createIndex()
    ix.upsert('manuscript', { id: 'a', kind: 'scene', title: 'One', parts: parts('the dragon') })
    ix.upsert('manuscript', { id: 'b', kind: 'scene', title: 'Dragon', parts: parts('nothing') })
    ix.upsert('manuscript', { id: 'c', kind: 'scene', title: 'Three', parts: parts('a dragon') })
    expect(search(ix, 'dragon').groups[0].hits.map((h) => h.id)).toEqual(['b', 'a', 'c'])
  })

  it('caps hits per area and counts the rest', () => {
    const ix = createIndex()
    for (let i = 0; i < 60; i++)
      ix.upsert('manuscript', { id: `s${i}`, kind: 'scene', title: `S${i}`, parts: parts('dragon') })
    const g = search(ix, 'dragon').groups[0]
    expect([g.hits.length, g.more]).toEqual([50, 10])
  })

  it('honours a custom limit', () => {
    const ix = createIndex()
    for (let i = 0; i < 5; i++) ix.upsert('rules', { id: `r${i}`, kind: 'rule', title: 'dragon' })
    const g = search(ix, 'dragon', { limit: 2 }).groups[0]
    expect([g.hits.length, g.more]).toEqual([2, 3])
  })

  it('empty or blank query gives no results', () => {
    expect(search(sample(), '').groups).toEqual([])
    expect(search(sample(), '   ').groups).toEqual([])
  })

  it('a query of only combining marks gives no results', () => {
    expect(search(sample(), '́').groups).toEqual([])
  })

  it('a removed (trashed) item is not found; upserting it again brings it back', () => {
    const ix = sample()
    ix.remove('s1')
    expect(search(ix, 'pier').groups).toEqual([])
    ix.upsert('manuscript', { id: 's1', kind: 'scene', title: 'Docks', parts: parts('Anna waited at the pier.') })
    expect(search(ix, 'pier').groups).toHaveLength(1)
  })

  it('an edited body is found by new text and no longer by old text', () => {
    const ix = sample()
    ix.upsert('manuscript', { id: 's1', kind: 'scene', title: 'Docks', parts: parts('Now a lighthouse.') })
    expect(search(ix, 'pier').groups).toEqual([])
    expect(search(ix, 'lighthouse').groups).toHaveLength(1)
  })

  it('one hit per item even when it matches many times', () => {
    const ix = createIndex()
    ix.upsert('manuscript', { id: 's', kind: 'scene', title: 't', parts: parts('dragon', 'dragon', 'dragon') })
    expect(search(ix, 'dragon').groups[0].hits).toHaveLength(1)
  })
})

describe('speed', () => {
  it('builds and searches a few-hundred-scene book quickly', () => {
    const t0 = performance.now()
    const ix = createIndex()
    const text = Array.from({ length: 600 }, (_, i) => `słowo${i}`).join(' ')
    for (let i = 0; i < 500; i++)
      ix.upsert('manuscript', {
        id: `s${i}`,
        kind: 'scene',
        title: `Scena ${i}`,
        parts: [{ text, blockId: 'b' }, { text: 'Łódź', blockId: 'c' }],
      })
    const built = performance.now() - t0
    const t1 = performance.now()
    const r = search(ix, 'lodz')
    const searched = performance.now() - t1
    expect(r.groups[0].more).toBe(450)
    expect(built).toBeLessThan(1000)
    expect(searched).toBeLessThan(1000)
  })
})
