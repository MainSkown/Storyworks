import { describe, expect, it } from 'vitest'
import { resolveTheme } from './resolveTheme'

describe('resolveTheme', () => {
  it('explicit light wins over a dark system', () => {
    expect(resolveTheme('light', true)).toBe('light')
  })
  it('explicit dark wins over a light system', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
  })
  it('system follows the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})
