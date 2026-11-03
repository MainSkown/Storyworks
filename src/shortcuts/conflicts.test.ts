import { describe, expect, it } from 'vitest'
import { findConflict, validateCombo } from './conflicts'
import { defaultCombos, effectiveCombos } from './registry'

const combos = defaultCombos()

describe('validateCombo', () => {
  it('accepts a Mod combo', () => expect(validateCombo('Mod+K')).toBeNull())
  it('requires Ctrl/Cmd', () => {
    expect(validateCombo('Alt+K')).toBe('needsModifier')
    expect(validateCombo('K')).toBe('needsModifier')
  })
  it('rejects garbage', () => expect(validateCombo('x+y+z')).toBe('invalid'))
})

describe('findConflict', () => {
  it('finds none for a free combo', () => {
    expect(findConflict('switcher', 'Mod+K', combos)).toBeNull()
  })
  it('does not conflict with its own current key', () => {
    expect(findConflict('switcher', combos.switcher, combos)).toBeNull()
  })
  it('finds another app shortcut', () => {
    expect(findConflict('switcher', combos.search, combos)).toEqual({ kind: 'shortcut', id: 'search' })
  })
  it('compares against overrides, not defaults', () => {
    const c = effectiveCombos({ search: 'Mod+K' })
    expect(findConflict('switcher', 'Mod+K', c)).toEqual({ kind: 'shortcut', id: 'search' })
    expect(findConflict('switcher', 'Mod+Shift+F', c)).toBeNull()
  })
  it('finds a fixed editor key', () => {
    expect(findConflict('switcher', 'Mod+B', combos)).toMatchObject({ kind: 'fixed', id: 'bold' })
  })
  it('finds reserved OS and browser combos', () => {
    expect(findConflict('switcher', 'Mod+W', combos)).toEqual({ kind: 'reserved' })
    expect(findConflict('switcher', 'Mod+Shift+T', combos)).toEqual({ kind: 'reserved' })
  })
})
