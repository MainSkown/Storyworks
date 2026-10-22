import { describe, expect, it } from 'vitest'
import { isPanelToggleShortcut } from './panelShortcut'

const base = {
  key: 'p',
  code: 'KeyP',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
}

describe('isPanelToggleShortcut', () => {
  it('matches Ctrl+Alt+P and Cmd+Alt+P', () => {
    expect(isPanelToggleShortcut({ ...base, ctrlKey: true, altKey: true })).toBe(true)
    expect(isPanelToggleShortcut({ ...base, metaKey: true, altKey: true })).toBe(true)
  })

  it('matches by physical key when Alt changes the character', () => {
    expect(isPanelToggleShortcut({ ...base, key: 'π', ctrlKey: true, altKey: true })).toBe(true)
  })

  it('rejects missing modifiers, Shift, and other keys', () => {
    expect(isPanelToggleShortcut({ ...base, ctrlKey: true })).toBe(false)
    expect(isPanelToggleShortcut({ ...base, altKey: true })).toBe(false)
    expect(isPanelToggleShortcut({ ...base, ctrlKey: true, altKey: true, shiftKey: true })).toBe(
      false,
    )
    expect(
      isPanelToggleShortcut({ ...base, key: 'o', code: 'KeyO', ctrlKey: true, altKey: true }),
    ).toBe(false)
  })
})
