import { describe, expect, it } from 'vitest'
import { sourceFromCodex, suggest, TIMES, type SuggestSource } from './suggest'

const src: SuggestSource = {
  lang: 'en',
  characters: [
    { name: 'Anna Kowalska', aliases: ['Annie'] },
    { name: 'Bob', aliases: [] },
    { name: 'Joanna', aliases: [] },
    { name: 'Łukasz', aliases: ['Wolf'] },
  ],
  places: [
    { name: 'Harbour', aliases: [] },
    { name: 'Old Mill', aliases: ['The Mill'] },
    { name: 'Żabka Shop', aliases: [] },
  ],
}
const empty: SuggestSource = { lang: 'en', characters: [], places: [] }

const texts = (r: ReturnType<typeof suggest>) => r.items.map((i) => i.insert)

describe('character cue suggestions', () => {
  it('prefix matches come before substring matches', () => {
    expect(texts(suggest('character', 'ann', src))).toEqual(['Anna Kowalska', 'Joanna'])
  })

  it('finds an entry through its alias and inserts the entry name', () => {
    const r = suggest('character', 'wol', src)
    expect(texts(r)).toEqual(['Łukasz'])
    expect(r.items[0]!.via).toBe('Wolf')
  })

  it('ignores case and diacritics, including ł', () => {
    expect(texts(suggest('character', 'LUK', src))).toEqual(['Łukasz'])
    expect(texts(suggest('character', 'łu', src))).toEqual(['Łukasz'])
  })

  it('nothing is offered for empty text or a cue with a parenthetical', () => {
    expect(suggest('character', '', src).items).toEqual([])
    expect(suggest('character', 'Anna (V.O.)', src).items).toEqual([])
    expect(suggest('character', 'Anna (V.O.)', src).addName).toBeNull()
  })

  it('a full name or alias already typed is not suggested again and gets no hint', () => {
    const r = suggest('character', 'bob', src)
    expect(r.items).toEqual([])
    expect(r.addName).toBeNull()
    expect(suggest('character', 'Annie', src).addName).toBeNull()
  })

  it('an unknown name offers the add-to-codex hint, with or without matches', () => {
    expect(suggest('character', 'Zed', src).addName).toBe('Zed')
    const r = suggest('character', 'Ann', src)
    expect(r.items.length).toBeGreaterThan(0)
    expect(r.addName).toBe('Ann')
  })

  it('works without a codex', () => {
    const r = suggest('character', 'Zed', empty)
    expect(r.items).toEqual([])
    expect(r.addName).toBe('Zed')
  })

  it('replaces the whole block text', () => {
    expect(suggest('character', 'ann', src).from).toBe(0)
  })
})

describe('scene heading suggestions', () => {
  it('offers prefixes while the prefix is being typed', () => {
    expect(texts(suggest('sceneHeading', 'i', src))).toEqual(['INT. ', 'INT./EXT. '])
    expect(texts(suggest('sceneHeading', 'ex', src))).toEqual(['EXT. '])
    expect(texts(suggest('sceneHeading', '', src))).toEqual([])
  })

  it('after the prefix, offers codex places and aliases', () => {
    expect(texts(suggest('sceneHeading', 'INT. ', src))).toEqual([
      'Harbour - ',
      'Old Mill - ',
      'Żabka Shop - ',
    ])
    expect(texts(suggest('sceneHeading', 'EXT. mill', src))).toEqual(['Old Mill - '])
    expect(texts(suggest('sceneHeading', 'EXT. zab', src))).toEqual(['Żabka Shop - '])
  })

  it('a place is replaced from after the prefix', () => {
    expect(suggest('sceneHeading', 'INT. har', src).from).toBe('INT. '.length)
  })

  it('free text is allowed: no places means no items and no hint', () => {
    const r = suggest('sceneHeading', 'INT. Somewhere', src)
    expect(r.items).toEqual([])
    expect(r.addName).toBeNull()
  })

  it('after " - " offers times of day, prefix first', () => {
    const r = suggest('sceneHeading', 'INT. Harbour - ', src)
    expect(texts(r)).toEqual([...TIMES.en])
    expect(r.from).toBe('INT. Harbour - '.length)
    expect(texts(suggest('sceneHeading', 'INT. Harbour - d', src))).toEqual(['DAY', 'DAWN', 'DUSK'])
    expect(texts(suggest('sceneHeading', 'INT. Harbour - ght', src))).toEqual(['NIGHT'])
  })

  it('a time already typed in full is not offered again', () => {
    expect(texts(suggest('sceneHeading', 'INT. Harbour - night', src))).toEqual([])
  })

  it('times follow the language', () => {
    const pl = suggest('sceneHeading', 'INT. Port - n', { ...src, lang: 'pl' })
    expect(texts(pl)).toEqual(['NOC', 'DZIEŃ', 'PÓŹNIEJ'])
    expect(texts(suggest('sceneHeading', 'INT. Port - dz', { ...src, lang: 'pl' }))).toEqual([
      'DZIEŃ',
    ])
  })

  it('works without a codex', () => {
    expect(texts(suggest('sceneHeading', 'INT. ', empty))).toEqual([])
    expect(texts(suggest('sceneHeading', 'INT. X - ', empty)).length).toBe(TIMES.en.length)
  })
})

describe('codex source', () => {
  const types = [
    { id: 't1', name: 'Character' },
    { id: 't2', name: 'Miejsce' },
    { id: 't3', name: 'Postać' },
    { id: 't4', name: 'Item' },
  ]
  const entries = [
    { typeId: 't1', name: 'Anna', aliases: ['Annie', ' '] },
    { typeId: 't3', name: 'Ewa', aliases: [] },
    { typeId: 't2', name: 'Port', aliases: [] },
    { typeId: 't4', name: 'Sword', aliases: [] },
    { typeId: 't1', name: '  ', aliases: [] },
  ]

  it('takes characters and places by starter type name in either language', () => {
    const s = sourceFromCodex(types, entries, 'pl')
    expect(s.characters).toEqual([
      { name: 'Anna', aliases: ['Annie'] },
      { name: 'Ewa', aliases: [] },
    ])
    expect(s.places).toEqual([{ name: 'Port', aliases: [] }])
    expect(s.characterTypeId).toBe('t1')
  })

  it('no matching types means empty lists', () => {
    const s = sourceFromCodex([{ id: 'x', name: 'Item' }], entries, 'en')
    expect(s.characters).toEqual([])
    expect(s.characterTypeId).toBeUndefined()
  })
})
