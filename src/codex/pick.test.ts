import { describe, expect, it } from 'vitest'
import { describeEntry, groupPickerEntries } from './pick'

const types = [
  { id: 't1', name: 'Character', color: '#111111', icon: 'person' },
  { id: 't2', name: 'Place', color: '#222222', icon: 'place' },
]
const entry = (id: string, name: string, typeId: string, aliases: string[] = []) => ({
  id,
  name,
  typeId,
  aliases,
})
const entries = [
  entry('e1', 'Anna', 't1', ['Annie']),
  entry('e2', 'Harbor', 't2'),
  entry('e3', 'Bram', 't1'),
  entry('e4', 'Lost', 'gone'),
]

describe('groupPickerEntries', () => {
  it('groups by type in type order, entries keep their order, unknown type goes last', () => {
    const g = groupPickerEntries(entries, types, '')
    expect(g.map((x) => [x.typeId, x.rows.map((r) => r.entryId)])).toEqual([
      ['t1', ['e1', 'e3']],
      ['t2', ['e2']],
      [null, ['e4']],
    ])
  })

  it('leaves out types without entries', () => {
    expect(
      groupPickerEntries([entry('e2', 'Harbor', 't2')], types, '').map((x) => x.typeId),
    ).toEqual(['t2'])
  })

  it('searches names and aliases, case-insensitive', () => {
    expect(
      groupPickerEntries(entries, types, 'ANN').flatMap((g) => g.rows.map((r) => r.entryId)),
    ).toEqual(['e1'])
    expect(
      groupPickerEntries(entries, types, 'annie').flatMap((g) => g.rows.map((r) => r.entryId)),
    ).toEqual(['e1'])
    expect(groupPickerEntries(entries, types, 'zzz')).toEqual([])
  })

  it('rows carry the type name', () => {
    expect(groupPickerEntries(entries, types, '')[0]!.rows[0]).toMatchObject({
      name: 'Anna',
      typeName: 'Character',
    })
  })
})

describe('describeEntry', () => {
  it('gives name and type, null when the entry is not there', () => {
    expect(describeEntry(entries, types, 'e2')).toEqual({
      name: 'Harbor',
      typeName: 'Place',
      typeColor: '#222222',
    })
    expect(describeEntry(entries, types, 'e4')).toEqual({
      name: 'Lost',
      typeName: null,
      typeColor: null,
    })
    expect(describeEntry(entries, types, 'nope')).toBeNull()
  })
})
