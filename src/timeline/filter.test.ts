import { describe, expect, it } from 'vitest'
import { applyFilter, isEmptyFilter, type FilterNode } from './filter'

const nodes: FilterNode[] = [
  { id: 'a', tag: 'battle', branchId: null },
  { id: 'b', tag: 'battle', branchId: 'br' },
  { id: 'c', tag: 'love', branchId: 'br' },
  { id: 'd', tag: null, branchId: null },
]
const edges = [
  { id: 'e1', from: 'a', to: 'b' },
  { id: 'e2', from: 'b', to: 'c' },
  { id: 'e3', from: 'c', to: 'd' },
]
const empty = { tags: [], branchIds: [] }

describe('applyFilter', () => {
  it('an empty filter matches everything and dims nothing', () => {
    const r = applyFilter(nodes, edges, empty)
    expect(r.matched.size).toBe(4)
    expect(r.dimmedNodes.size).toBe(0)
    expect(r.dimmedEdges.size).toBe(0)
    expect(isEmptyFilter(empty)).toBe(true)
  })

  it('filters by tag', () => {
    const r = applyFilter(nodes, edges, { tags: ['battle'], branchIds: [] })
    expect([...r.matched].sort()).toEqual(['a', 'b'])
    expect([...r.dimmedNodes].sort()).toEqual(['c', 'd'])
  })

  it('several tags are OR', () => {
    const r = applyFilter(nodes, edges, { tags: ['battle', 'love'], branchIds: [] })
    expect([...r.matched].sort()).toEqual(['a', 'b', 'c'])
  })

  it('filters by branch, null means the main line', () => {
    const r = applyFilter(nodes, edges, { tags: [], branchIds: [null] })
    expect([...r.matched].sort()).toEqual(['a', 'd'])
    const r2 = applyFilter(nodes, edges, { tags: [], branchIds: ['br'] })
    expect([...r2.matched].sort()).toEqual(['b', 'c'])
  })

  it('tag and branch together are AND', () => {
    const r = applyFilter(nodes, edges, { tags: ['battle'], branchIds: ['br'] })
    expect([...r.matched]).toEqual(['b'])
  })

  it('keeps every edge, dimming those with a non-matching end', () => {
    const r = applyFilter(nodes, edges, { tags: ['battle'], branchIds: [] })
    expect([...r.dimmedEdges].sort()).toEqual(['e2', 'e3'])
  })

  it('a filter matching nothing dims everything but drops nothing', () => {
    const r = applyFilter(nodes, edges, { tags: ['none'], branchIds: [] })
    expect(r.matched.size).toBe(0)
    expect(r.dimmedNodes.size).toBe(4)
    expect(r.dimmedEdges.size).toBe(3)
  })

  describe('linked codex entry', () => {
    const withEntries: FilterNode[] = [
      { id: 'a', tag: 'battle', branchId: null, codexIds: ['x', 'y'] },
      { id: 'b', tag: 'love', branchId: null, codexIds: ['y'] },
      { id: 'c', tag: 'battle', branchId: 'br' },
    ]
    const f = (over: object) => ({ tags: [], branchIds: [], ...over })

    it('matches nodes whose codexIds include the entry', () => {
      const r = applyFilter(withEntries, [], f({ entryId: 'y' }))
      expect([...r.matched].sort()).toEqual(['a', 'b'])
      expect([...r.dimmedNodes]).toEqual(['c'])
    })

    it('an unknown entry matches no nodes and does not throw', () => {
      const r = applyFilter(withEntries, [], f({ entryId: 'gone' }))
      expect(r.matched.size).toBe(0)
      expect(r.dimmedNodes.size).toBe(3)
    })

    it('combines with tag and branch filters (AND)', () => {
      const r = applyFilter(withEntries, [], f({ entryId: 'y', tags: ['battle'] }))
      expect([...r.matched]).toEqual(['a'])
    })

    it('counts as an active filter; null does not', () => {
      expect(isEmptyFilter(f({ entryId: 'y' }))).toBe(false)
      expect(isEmptyFilter(f({ entryId: null }))).toBe(true)
    })
  })
})
