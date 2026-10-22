import { describe, expect, it } from 'vitest'
import { resolveLanguage } from './resolveLanguage'

describe('resolveLanguage', () => {
  it('maps pl to pl', () => {
    expect(resolveLanguage('pl')).toBe('pl')
  })

  it('maps regional pl locales to pl', () => {
    expect(resolveLanguage('pl-PL')).toBe('pl')
  })

  it('maps en locales to en', () => {
    expect(resolveLanguage('en-US')).toBe('en')
  })

  it('falls back to en for other languages', () => {
    expect(resolveLanguage('de-DE')).toBe('en')
  })

  it('falls back to en for empty input', () => {
    expect(resolveLanguage('')).toBe('en')
  })
})
