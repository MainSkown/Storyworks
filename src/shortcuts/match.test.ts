import { describe, expect, it } from 'vitest'
import { comboFromEvent, displayCombo, matchesCombo, parseCombo } from './match'

const base = { key: 'p', code: 'KeyP', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }

describe('parseCombo', () => {
  it('normalises modifier order', () => {
    expect(parseCombo('Shift+Mod+F')).toEqual({ mod: true, alt: false, shift: true, key: 'F' })
  })
  it.each(['', 'Mod', 'Mod+', 'Mod+Alt', 'Mod+PP', 'Mod+F+G', 'Hyper+F', 'Mod+Mod+F'])(
    'rejects %j',
    (s) => expect(parseCombo(s)).toBeNull(),
  )
})

describe('matchesCombo', () => {
  it('matches Ctrl and Cmd', () => {
    expect(matchesCombo({ ...base, ctrlKey: true }, 'Mod+P')).toBe(true)
    expect(matchesCombo({ ...base, metaKey: true }, 'Mod+P')).toBe(true)
  })
  it('matches by physical key when Alt changes the character', () => {
    expect(matchesCombo({ ...base, key: 'π', ctrlKey: true, altKey: true }, 'Mod+Alt+P')).toBe(true)
  })
  it('matches punctuation keys', () => {
    expect(matchesCombo({ ...base, key: '/', code: 'Slash', ctrlKey: true }, 'Mod+Slash')).toBe(true)
    expect(matchesCombo({ ...base, key: '/', code: 'Unidentified', ctrlKey: true }, 'Mod+Slash')).toBe(true)
  })
  it('needs exactly the listed modifiers', () => {
    const e = { ...base, ctrlKey: true }
    expect(matchesCombo(e, 'Mod+Alt+P')).toBe(false)
    expect(matchesCombo({ ...e, altKey: true }, 'Mod+P')).toBe(false)
    expect(matchesCombo({ ...e, shiftKey: true }, 'Mod+P')).toBe(false)
    expect(matchesCombo(base, 'Mod+P')).toBe(false)
  })
  it('rejects other keys', () => {
    expect(matchesCombo({ ...base, key: 'o', code: 'KeyO', ctrlKey: true }, 'Mod+P')).toBe(false)
  })
  it('never matches an unparsable combo', () => {
    expect(matchesCombo({ ...base, ctrlKey: true }, 'nonsense')).toBe(false)
  })
})

describe('comboFromEvent', () => {
  it('builds a canonical combo from the physical key', () => {
    expect(comboFromEvent({ ...base, key: 'π', ctrlKey: true, altKey: true, shiftKey: true })).toBe(
      'Mod+Alt+Shift+P',
    )
    expect(comboFromEvent({ ...base, key: '/', code: 'Slash', metaKey: true })).toBe('Mod+Slash')
  })
  it('returns null for a lone modifier or unsupported key', () => {
    expect(comboFromEvent({ ...base, key: 'Control', code: 'ControlLeft', ctrlKey: true })).toBeNull()
    expect(comboFromEvent({ ...base, key: 'Tab', code: 'Tab', ctrlKey: true })).toBeNull()
  })
})

describe('displayCombo', () => {
  it('uses Ctrl or Cmd and readable keys', () => {
    expect(displayCombo('Mod+Shift+F', false)).toBe('Ctrl+Shift+F')
    expect(displayCombo('Mod+Slash', true)).toBe('Cmd+/')
  })
})
