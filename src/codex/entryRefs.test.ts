import { describe, expect, it } from 'vitest'
import { povOptions, resolveEntryRefs, sceneEntryIds } from './entryRefs'

const types = [
  { id: 't-item', name: 'Item' },
  { id: 't-char', name: 'character' },
]
const entries = [
  { id: 'sword', typeId: 't-item', name: 'Sword' },
  { id: 'anna', typeId: 't-char', name: 'Anna' },
  { id: 'bob', typeId: 't-char', name: 'Bob' },
  { id: 'lost', typeId: 'gone', name: 'Lost' },
]

describe('resolveEntryRefs', () => {
  it('keeps order, adds the type name, marks unknown ids missing', () => {
    const r = resolveEntryRefs(['sword', 'x', 'anna'], entries, types)
    expect(r.map((x) => (x.missing ? `!${x.id}` : `${x.entry.name}:${x.typeName}`))).toEqual([
      'Sword:Item',
      '!x',
      'Anna:character',
    ])
  })
  it('an entry whose type is gone has no type name', () => {
    expect(resolveEntryRefs(['lost'], entries, types)[0]).toMatchObject({
      missing: false,
      typeName: null,
    })
  })
  it('lists an id once', () => {
    expect(resolveEntryRefs(['anna', 'anna'], entries, types)).toHaveLength(1)
  })
})

describe('povOptions', () => {
  it('lists entries of a Character-named type first (case-insensitive), then the rest', () => {
    expect(povOptions(entries, types).map((e) => e.id)).toEqual(['anna', 'bob', 'sword', 'lost'])
  })
  it('keeps manifest order when no type is named Character', () => {
    expect(povOptions(entries, [{ id: 't-item', name: 'Item' }]).map((e) => e.id)).toEqual([
      'sword',
      'anna',
      'bob',
      'lost',
    ])
  })
})

describe('sceneEntryIds', () => {
  it('collects codex link targets of the scene plus the POV, once each, links first', () => {
    const links = [
      { kind: 'codex', from: { item: 's1', block: 'b1' }, to: { item: 'sword' } },
      { kind: 'codex', from: { item: 's1', block: 'b2' }, to: { item: 'sword' } },
      { kind: 'event', from: { item: 's1', block: 'b3' }, to: { item: 'tl', block: 'n' } },
      { kind: 'codex', from: { item: 's2', block: 'b1' }, to: { item: 'bob' } },
    ]
    expect(sceneEntryIds(links, 's1', 'anna')).toEqual(['sword', 'anna'])
  })
  it('POV already linked is not repeated; no POV is fine', () => {
    const links = [{ kind: 'codex', from: { item: 's1', block: 'b1' }, to: { item: 'anna' } }]
    expect(sceneEntryIds(links, 's1', 'anna')).toEqual(['anna'])
    expect(sceneEntryIds(links, 's1', undefined)).toEqual(['anna'])
  })
})
