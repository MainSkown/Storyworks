import { describe, expect, it } from 'vitest'
import { defaultCombos, effectiveCombos, matchShortcut, SHORTCUTS } from './registry'

const base = { key: 'p', code: 'KeyP', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }
const press = (patch: Partial<typeof base>) => ({ ...base, ...patch })

describe('default shortcuts', () => {
  const combos = defaultCombos()
  it('match the keys the app has always used', () => {
    expect(matchShortcut(press({ ctrlKey: true, shiftKey: true, key: 'F', code: 'KeyF' }), combos)).toBe('search')
    expect(matchShortcut(press({ metaKey: true }), combos)).toBe('switcher')
    expect(matchShortcut(press({ ctrlKey: true, altKey: true }), combos)).toBe('panelToggle')
    expect(matchShortcut(press({ ctrlKey: true, altKey: true, key: 'f', code: 'KeyF' }), combos)).toBe('focusMode')
    expect(matchShortcut(press({ ctrlKey: true, key: '/', code: 'Slash' }), combos)).toBe('shortcutOverlay')
  })
  it('do not clash with each other', () => {
    expect(new Set(Object.values(combos)).size).toBe(SHORTCUTS.length)
  })
  it('ignore plain keys', () => {
    expect(matchShortcut(base, combos)).toBeNull()
  })
})

describe('overrides', () => {
  it('replace the default for that action only', () => {
    const combos = effectiveCombos({ switcher: 'Mod+K' })
    const k = press({ ctrlKey: true, key: 'k', code: 'KeyK' })
    expect(matchShortcut(k, combos)).toBe('switcher')
    expect(matchShortcut(press({ ctrlKey: true }), combos)).toBeNull()
    expect(combos.search).toBe(defaultCombos().search)
  })
  it('ignore unknown ids and unparsable combos', () => {
    const combos = effectiveCombos({ nope: 'Mod+K', search: 'garbage' })
    expect(combos).toEqual(defaultCombos())
  })
  it('restoring defaults means an empty override map', () => {
    expect(effectiveCombos({})).toEqual(defaultCombos())
  })
})
