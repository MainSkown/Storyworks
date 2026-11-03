import { describe, expect, it } from 'vitest'
import { createIndex } from './index'
import { search } from './query'
import { switchTo } from './switcher'
import { createAreaSync, type Unit } from './sync'

const scene = (id: string, title: string, parentId?: string): Unit => ({
  id,
  deps: [title, parentId],
  make: () => ({ id, kind: 'scene', title, parentId }),
})
const chapter = (id: string, title: string): Unit => ({
  id,
  deps: [title],
  make: () => ({ id, kind: 'chapter', title }),
})
const ids = (ix: ReturnType<typeof createIndex>, q: string) =>
  search(ix, q).groups.flatMap((g) => g.hits.map((h) => h.id))

describe('createAreaSync', () => {
  it('adds new items and removes trashed ones', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'manuscript')
    s.sync([chapter('c1', 'Harbour'), scene('s1', 'Dawn', 'c1')])
    expect(ids(ix, 'dawn')).toEqual(['s1'])
    s.sync([chapter('c1', 'Harbour')])
    expect(ids(ix, 'dawn')).toEqual([])
  })

  it('finds a restored item again', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'manuscript')
    s.sync([scene('s1', 'Dawn')])
    s.sync([])
    s.sync([scene('s1', 'Dawn')])
    expect(ids(ix, 'dawn')).toEqual(['s1'])
  })

  it('renames in place and keeps the loaded body', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'manuscript')
    s.sync([scene('s1', 'Dawn')])
    ix.setParts('s1', [{ text: 'The gull cried', blockId: 'b1' }])
    s.sync([scene('s1', 'Dusk')])
    expect(ids(ix, 'dawn')).toEqual([])
    expect(ids(ix, 'dusk')).toEqual(['s1'])
    expect(ids(ix, 'gull')).toEqual(['s1'])
  })

  it('does not rebuild an item whose inputs are unchanged', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'manuscript')
    let made = 0
    const unit = (): Unit => ({ id: 'r1', deps: ['x'], make: () => (made++, { id: 'r1', kind: 'rule', title: 'x' }) })
    s.sync([unit()])
    s.sync([unit()])
    expect(made).toBe(1)
  })

  it('follows a moved scene when its chapter goes away', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'manuscript')
    s.sync([chapter('c1', 'One'), chapter('c2', 'Two'), scene('s1', 'Dawn', 'c1')])
    s.sync([chapter('c2', 'Two'), scene('s1', 'Dawn', 'c2')])
    expect(ids(ix, 'dawn')).toEqual(['s1'])
  })

  it('keeps document order after a reorder', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'manuscript')
    s.sync([scene('a', 'Wind'), scene('b', 'Wind')])
    s.sync([scene('b', 'Wind'), scene('a', 'Wind')])
    expect(ids(ix, 'wind')).toEqual(['b', 'a'])
  })

  it('feeds the switcher too', () => {
    const ix = createIndex()
    const s = createAreaSync(ix, 'manuscript')
    s.sync([scene('s1', 'Dawn')])
    s.sync([scene('s1', 'Noon')])
    expect(switchTo(ix, 'noo', []).map((e) => e.id)).toEqual(['s1'])
    expect(switchTo(ix, 'daw', [])).toEqual([])
  })
})
