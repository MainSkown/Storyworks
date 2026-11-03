import { describe, expect, it } from 'vitest'
import type { DictionaryInfo } from './dictionaryStore'
import { effectiveSelection, findMissing, withToggled } from './selection'

const info = (name: string, source: DictionaryInfo['source']): DictionaryInfo => ({
  name,
  scope: source === 'local' ? 'local' : 'global',
  source,
  kind: 'hunspell',
  readOnly: source === 'bundled',
  shadowed: false,
})

describe('effectiveSelection', () => {
  it('uses the book language default when nothing is chosen', () => {
    expect(effectiveSelection([], 'pl-PL')).toEqual({
      refs: [{ name: 'pl', scope: 'global' }],
      isDefault: true,
    })
    expect(effectiveSelection([], 'de')).toEqual({ refs: [], isDefault: true })
  })

  it('prefers the explicit selection', () => {
    const refs = [{ name: 'mine', scope: 'local' as const }]
    expect(effectiveSelection(refs, 'en')).toEqual({ refs, isDefault: false })
  })
})

describe('findMissing', () => {
  const infos = [info('en', 'bundled'), info('mine', 'local'), info('shared', 'global')]

  it('reports selected dictionaries that are not installed', () => {
    const sel = [
      { name: 'en', scope: 'global' as const },
      { name: 'gone', scope: 'global' as const },
      { name: 'mine', scope: 'global' as const },
      { name: 'shared', scope: 'local' as const },
    ]
    expect(findMissing(sel, infos)).toEqual([
      { name: 'gone', scope: 'global' },
      { name: 'shared', scope: 'local' },
    ])
  })

  it('reports nothing for a complete selection', () => {
    expect(findMissing([{ name: 'shared', scope: 'global' }], infos)).toEqual([])
  })
})

describe('withToggled', () => {
  const a = { name: 'a', scope: 'global' as const }
  const b = { name: 'a', scope: 'local' as const }
  it('adds once and removes by name + scope', () => {
    expect(withToggled([a], b, true)).toEqual([a, b])
    expect(withToggled([a, b], b, true)).toEqual([a, b])
    expect(withToggled([a, b], a, false)).toEqual([b])
  })
})
