import { describe, expect, it } from 'vitest'
import { createIndex, type SearchIndex } from './index'
import { pushRecent, switchTo } from './switcher'

function sample(): SearchIndex {
  const ix = createIndex()
  ix.upsert('manuscript', { id: 'ch', kind: 'chapter', title: 'The Harbour' })
  ix.upsert('manuscript', { id: 's1', kind: 'scene', title: 'Harbour at night', parts: [{ text: 'secretword' }] })
  ix.upsert('codex', { id: 'e1', kind: 'entry', title: 'Captain Hale', aliases: ['Old Salt'] })
  ix.upsert('rules', { id: 'r1', kind: 'rule', title: 'Tides' })
  ix.upsert('knowledge', { id: 'k1', kind: 'knowledge', title: 'Hidden cove' })
  ix.upsert('timelines', { id: 't1', kind: 'timeline', title: 'Main' })
  ix.upsert('timelines', { id: 'n1', kind: 'node', title: 'Storm', parentId: 't1' })
  return ix
}
const ids = (q: string, recents: string[] = [], ix = sample()) => switchTo(ix, q, recents).map((e) => e.id)

describe('switchTo', () => {
  it('matches scenes, chapters, entries, rules, knowledge, timelines and nodes by title', () => {
    expect(ids('harbour')).toEqual(['s1', 'ch'])
    expect(ids('tides')).toEqual(['r1'])
    expect(ids('cove')).toEqual(['k1'])
    expect(ids('main')).toEqual(['t1'])
    expect(ids('storm')).toEqual(['n1'])
  })

  it('matches by alias and reports which one', () => {
    const [hit] = switchTo(sample(), 'salt', [])
    expect([hit.id, hit.matchedAlias]).toEqual(['e1', 'Old Salt'])
  })

  it('does not search body text', () => {
    expect(ids('secretword')).toEqual([])
  })

  it('ignores case and diacritics', () => {
    const ix = createIndex()
    ix.upsert('codex', { id: 'e', kind: 'entry', title: 'Łukasz' })
    expect(ids('LUKA', [], ix)).toEqual(['e'])
  })

  it('a title that starts with the text ranks above one that only contains it', () => {
    const ix = createIndex()
    ix.upsert('rules', { id: 'a', kind: 'rule', title: 'The magic' })
    ix.upsert('rules', { id: 'b', kind: 'rule', title: 'Magic costs' })
    expect(ids('magic', [], ix)).toEqual(['b', 'a'])
  })

  it('recently opened items come first among equal matches', () => {
    const ix = createIndex()
    ix.upsert('rules', { id: 'a', kind: 'rule', title: 'Magic one' })
    ix.upsert('rules', { id: 'b', kind: 'rule', title: 'Magic two' })
    expect(ids('magic', ['b'], ix)).toEqual(['b', 'a'])
  })

  it('the match range points into the shown title', () => {
    const [hit] = switchTo(sample(), 'hale', [])
    expect('Captain Hale'.slice(hit.matchStart, hit.matchEnd)).toBe('Hale')
  })

  it('empty query returns recents, newest first, only items that still exist', () => {
    expect(ids('', ['r1', 'gone', 's1'])).toEqual(['r1', 's1'])
    expect(ids('  ', ['k1'])).toEqual(['k1'])
  })

  it('empty query with no recents returns nothing', () => {
    expect(ids('')).toEqual([])
  })

  it('empty query shows at most 10 recents', () => {
    const ix = createIndex()
    const many = Array.from({ length: 15 }, (_, i) => `r${i}`)
    many.forEach((id) => ix.upsert('rules', { id, kind: 'rule', title: id }))
    expect(switchTo(ix, '', many)).toHaveLength(10)
  })

  it('a trashed item is not offered', () => {
    const ix = sample()
    ix.remove('r1')
    expect(ids('tides', ['r1'], ix)).toEqual([])
  })
})

describe('pushRecent', () => {
  it('puts the id first', () => {
    expect(pushRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
  })
  it('moves an existing id to the front without duplicating', () => {
    expect(pushRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
  })
  it('keeps at most 10', () => {
    const list = Array.from({ length: 10 }, (_, i) => `i${i}`)
    const next = pushRecent(list, 'new')
    expect([next.length, next[0], next.includes('i9')]).toEqual([10, 'new', false])
  })
  it('does not change the input list', () => {
    const list = ['a']
    pushRecent(list, 'b')
    expect(list).toEqual(['a'])
  })
})
