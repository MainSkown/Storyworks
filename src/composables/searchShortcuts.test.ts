import { describe, expect, it } from 'vitest'
import { isPanelToggleShortcut } from './panelShortcut'
import { matchSearchShortcut } from './searchShortcuts'

const base = { key: 'p', code: 'KeyP', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }

describe('matchSearchShortcut', () => {
  it('Ctrl/Cmd+Shift+F opens search', () => {
    const f = { ...base, key: 'F', code: 'KeyF', shiftKey: true }
    expect(matchSearchShortcut({ ...f, ctrlKey: true })).toBe('search')
    expect(matchSearchShortcut({ ...f, metaKey: true })).toBe('search')
  })

  it('Ctrl/Cmd+P opens the switcher', () => {
    expect(matchSearchShortcut({ ...base, ctrlKey: true })).toBe('switcher')
    expect(matchSearchShortcut({ ...base, metaKey: true })).toBe('switcher')
  })

  it('does not take Ctrl+Alt+P (context panel)', () => {
    const e = { ...base, ctrlKey: true, altKey: true }
    expect(isPanelToggleShortcut(e)).toBe(true)
    expect(matchSearchShortcut(e)).toBeNull()
  })

  it('ignores plain keys, other modifiers and other letters', () => {
    expect(matchSearchShortcut(base)).toBeNull()
    expect(matchSearchShortcut({ ...base, ctrlKey: true, shiftKey: true })).toBeNull()
    expect(matchSearchShortcut({ ...base, key: 'f', code: 'KeyF', ctrlKey: true })).toBeNull()
    expect(matchSearchShortcut({ ...base, key: 'f', code: 'KeyF', ctrlKey: true, shiftKey: true, altKey: true })).toBeNull()
    expect(matchSearchShortcut({ ...base, key: 'o', code: 'KeyO', ctrlKey: true })).toBeNull()
  })
})
