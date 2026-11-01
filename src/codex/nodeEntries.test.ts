import { describe, expect, it } from 'vitest'
import { addEntryId, groupPickerEntries, resolveNodeEntries } from './nodeEntries'

const types = [
  { id: 't1', name: 'Character' },
  { id: 't2', name: 'Place' },
]
const entries = [
  { id: 'a', name: 'Anna', typeId: 't1', aliases: ['Ania'], tags: ['hero'] },
  { id: 'b', name: 'Bree', typeId: 't2', aliases: [], tags: [] },
  { id: 'c', name: 'Orphan', typeId: 'zz', aliases: [], tags: [] },
]

describe('resolveNodeEntries', () => {
  it('keeps node order and marks unknown ids missing', () => {
    const r = resolveNodeEntries(['b', 'gone', 'a'], entries, types)
    expect(r.map((x) => x.id)).toEqual(['b', 'gone', 'a'])
    expect(r[1]).toEqual({ id: 'gone', missing: true })
    expect(r[0]).toMatchObject({ missing: false, typeName: 'Place' })
  })
})

describe('addEntryId', () => {
  it('adds once', () => {
    expect(addEntryId(['a'], 'b')).toEqual(['a', 'b'])
    expect(addEntryId(['a'], 'a')).toEqual(['a'])
  })
})

describe('groupPickerEntries', () => {
  it('groups by type in type order and skips linked entries', () => {
    const g = groupPickerEntries(entries, types, '', ['a'])
    expect(g.map((x) => [x.name, x.entries.map((e) => e.id)])).toEqual([
      ['Place', ['b']],
      ['', ['c']],
    ])
  })
  it('matches name, alias, tag and type words', () => {
    expect(
      groupPickerEntries(entries, types, 'ania', []).flatMap((g) => g.entries.map((e) => e.id)),
    ).toEqual(['a'])
    expect(
      groupPickerEntries(entries, types, 'hero anna', []).flatMap((g) =>
        g.entries.map((e) => e.id),
      ),
    ).toEqual(['a'])
    expect(
      groupPickerEntries(entries, types, 'place', []).flatMap((g) => g.entries.map((e) => e.id)),
    ).toEqual(['b'])
  })
})
