import { describe, expect, it } from 'vitest'
import { isFocusShortcut } from './focusMode'
import { matchSearchShortcut } from './searchShortcuts'

const base = { key: 'f', code: 'KeyF', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }

describe('focus shortcut', () => {
  it('is Ctrl/Cmd+Alt+F and does not clash with search', () => {
    expect(isFocusShortcut({ ...base, altKey: true })).toBe(true)
    expect(isFocusShortcut({ ...base, ctrlKey: false, metaKey: true, altKey: true })).toBe(true)
    const search = { ...base, shiftKey: true }
    expect(isFocusShortcut(search)).toBe(false)
    expect(matchSearchShortcut(search)).toBe('search')
    expect(matchSearchShortcut({ ...base, altKey: true })).toBeNull()
  })
})
