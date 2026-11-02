import { describe, expect, it } from 'vitest'
import { filterGraph } from './filter'

const entries = [
  { id: 'a', typeId: 'char' },
  { id: 'b', typeId: 'char' },
  { id: 'c', typeId: 'place' },
  { id: 'd', typeId: 'place' },
]
const relationships = [
  { id: 'r1', fromId: 'a', toId: 'b', typeId: 'friend' },
  { id: 'r2', fromId: 'a', toId: 'c', typeId: 'lives' },
  { id: 'r3', fromId: 'b', toId: 'c', typeId: 'friend' },
]
const groups = [
  { id: 'g1', memberIds: ['a', 'b'] },
  { id: 'g2', memberIds: ['c'] },
]
const data = { entries, relationships, groups }
const none = { relationTypeIds: [], entryTypeIds: [], groupIds: [] }
const ids = (s: Set<string>) => [...s].sort()

describe('filterGraph', () => {
  it('empty filter shows everything and dims nothing', () => {
    const r = filterGraph(data, none)
    expect(ids(r.visibleEntryIds)).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(r.visibleRelationshipIds)).toEqual(['r1', 'r2', 'r3'])
    expect(r.dimmedEntryIds.size).toBe(0)
    expect(r.dimmedRelationshipIds.size).toBe(0)
  })

  it('entry type filter shows only that type and edges between shown entries', () => {
    const r = filterGraph(data, { ...none, entryTypeIds: ['char'] })
    expect(ids(r.visibleEntryIds)).toEqual(['a', 'b'])
    expect(ids(r.visibleRelationshipIds)).toEqual(['r1'])
  })

  it('group filter shows members of any selected group', () => {
    const r = filterGraph(data, { ...none, groupIds: ['g1', 'g2'] })
    expect(ids(r.visibleEntryIds)).toEqual(['a', 'b', 'c'])
    expect(ids(r.visibleRelationshipIds)).toEqual(['r1', 'r2', 'r3'])
  })

  it('entry type and group filters both apply', () => {
    const r = filterGraph(data, { ...none, entryTypeIds: ['place'], groupIds: ['g1', 'g2'] })
    expect(ids(r.visibleEntryIds)).toEqual(['c'])
  })

  it('relation type filter shows only matching relationships', () => {
    const r = filterGraph(data, { ...none, relationTypeIds: ['lives'] })
    expect(ids(r.visibleRelationshipIds)).toEqual(['r2'])
  })

  it('entries left without edges by the relation filter stay visible but dimmed', () => {
    const r = filterGraph(data, { ...none, relationTypeIds: ['lives'] })
    expect(ids(r.visibleEntryIds)).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(r.dimmedEntryIds)).toEqual(['b'])
  })

  it('entries that never had a relationship are not dimmed', () => {
    const r = filterGraph(data, { ...none, relationTypeIds: ['friend'] })
    expect(r.dimmedEntryIds.has('d')).toBe(false)
  })

  it('isolation is judged among entries that are shown', () => {
    const r = filterGraph(data, { ...none, entryTypeIds: ['char'], relationTypeIds: ['lives'] })
    expect(ids(r.visibleEntryIds)).toEqual(['a', 'b'])
    expect(r.visibleRelationshipIds.size).toBe(0)
    expect(ids(r.dimmedEntryIds)).toEqual(['a', 'b'])
  })

  it('relationships with unknown entries are never shown', () => {
    const r = filterGraph(
      {
        ...data,
        relationships: [...relationships, { id: 'r4', fromId: 'a', toId: 'zzz', typeId: 'friend' }],
      },
      none,
    )
    expect(r.visibleRelationshipIds.has('r4')).toBe(false)
  })
})
