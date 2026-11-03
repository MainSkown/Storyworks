import { describe, expect, it } from 'vitest'
import {
  isKnownName,
  rankSpeakers,
  recentSpeakers,
  resolveSpeaker,
  type SpeakerEntry,
} from './speakers'

const entries: SpeakerEntry[] = [
  { id: 'e1', name: 'Anna', aliases: ['Ania'] },
  { id: 'e2', name: 'Bartosz', aliases: [] },
  { id: 'e3', name: 'Łukasz', aliases: ['Luke'] },
  { id: 'e4', name: 'Hanna', aliases: [] },
]
const byId = (id: string) => entries.find((e) => e.id === id)

describe('resolveSpeaker', () => {
  it('no speaker is narration', () => {
    expect(resolveSpeaker({}, byId)).toEqual({ state: 'none' })
    expect(resolveSpeaker({ speakerId: null, speakerName: null }, byId)).toEqual({ state: 'none' })
    expect(resolveSpeaker({ speakerId: '', speakerName: '' }, byId)).toEqual({ state: 'none' })
  })

  it('a codex speaker shows its current name', () => {
    expect(resolveSpeaker({ speakerId: 'e1' }, byId)).toEqual({
      state: 'entry',
      id: 'e1',
      name: 'Anna',
    })
  })

  it('a codex speaker that is gone is broken', () => {
    expect(resolveSpeaker({ speakerId: 'zz' }, byId)).toEqual({ state: 'broken', id: 'zz' })
  })

  it('a plain name stays plain even when the codex has the same name', () => {
    expect(resolveSpeaker({ speakerName: 'Anna' }, byId)).toEqual({ state: 'name', name: 'Anna' })
  })
})

describe('rankSpeakers', () => {
  const names = (q: string, recent: string[] = []) =>
    rankSpeakers(q, entries, recent).map((r) => r.entry.name)

  it('with no query lists recent speakers first, then the rest alphabetically', () => {
    expect(names('', ['e4', 'e2'])).toEqual(['Hanna', 'Bartosz', 'Anna', 'Łukasz'])
  })

  it('a recent id that is not in the codex is ignored', () => {
    expect(names('', ['zz', 'e2'])).toEqual(['Bartosz', 'Anna', 'Hanna', 'Łukasz'])
  })

  it('prefix matches come before substring matches', () => {
    expect(names('an')).toEqual(['Anna', 'Hanna'])
  })

  it('finds by alias and says which alias matched', () => {
    const r = rankSpeakers('ania', entries, [])
    expect(r).toEqual([{ entry: entries[0], via: 'Ania' }])
  })

  it('ignores case and diacritics, including ł', () => {
    expect(names('lukasz')).toEqual(['Łukasz'])
    expect(names('LUKE')).toEqual(['Łukasz'])
  })

  it('no match gives an empty list', () => {
    expect(names('zzz')).toEqual([])
  })
})

describe('isKnownName', () => {
  it('matches names and aliases exactly, ignoring case and diacritics', () => {
    expect(isKnownName('anna', entries)).toBe(true)
    expect(isKnownName(' ŁUKASZ ', entries)).toBe(true)
    expect(isKnownName('luke', entries)).toBe(true)
    expect(isKnownName('Ann', entries)).toBe(false)
    expect(isKnownName('', entries)).toBe(false)
  })
})

describe('recentSpeakers', () => {
  const line = (speakerId: string | null) => ({ type: 'line', attrs: { speakerId } })
  it('lists distinct speakers, latest line first', () => {
    const doc = {
      type: 'doc',
      content: [line('e1'), line('e2'), line(null), line('e1'), line('e3')],
    }
    expect(recentSpeakers(doc)).toEqual(['e3', 'e1', 'e2'])
  })
  it('respects the limit and empty docs', () => {
    const doc = { type: 'doc', content: [line('e1'), line('e2'), line('e3')] }
    expect(recentSpeakers(doc, 2)).toEqual(['e3', 'e2'])
    expect(recentSpeakers({ type: 'doc' })).toEqual([])
  })
})

import { characterSpeakers } from './speakers'

describe('characterSpeakers', () => {
  const types = [
    { id: 't1', name: 'Character' },
    { id: 't2', name: 'Place' },
    { id: 't3', name: 'Postać' },
  ]
  const e = (id: string, typeId: string, name: string, aliases: string[] = []) => ({
    id,
    typeId,
    name,
    aliases,
  })

  it('keeps only characters, in either language, with their ids', () => {
    const r = characterSpeakers(types, [
      e('a', 't1', 'Anna', ['Ania', ' ']),
      e('b', 't2', 'Inn'),
      e('c', 't3', 'Ewa'),
      e('d', 't1', '  '),
    ])
    expect(r.list).toEqual([
      { id: 'a', name: 'Anna', aliases: ['Ania'] },
      { id: 'c', name: 'Ewa', aliases: [] },
    ])
    expect(r.characterTypeId).toBe('t1')
  })

  it('has no character type id when the codex has none', () => {
    expect(characterSpeakers([{ id: 't2', name: 'Place' }], []).characterTypeId).toBeUndefined()
  })
})
