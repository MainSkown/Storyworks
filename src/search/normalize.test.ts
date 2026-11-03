import { describe, expect, it } from 'vitest'
import { fold, foldMapped, originalRange } from './normalize'

describe('fold', () => {
  it('lowercases and strips diacritics', () => {
    expect(fold('Żółć Éclair')).toBe('zolc eclair')
  })
  it('maps ł and Ł to l', () => {
    expect(fold('Łódź łoś')).toBe('lodz los')
  })
  it('strips combining marks typed as separate characters', () => {
    expect(fold('é')).toBe('e')
  })
  it('treats the same word typed with or without diacritics alike', () => {
    expect(fold('Zażółć')).toBe(fold('zazolc'))
  })
})

describe('originalRange', () => {
  it('reports a match in the original text for Polish text', () => {
    const text = 'Wrócił do Łódź wczoraj'
    const m = foldMapped(text)
    const at = m.folded.indexOf('lodz')
    const r = originalRange(text, m, at, at + 4)
    expect(text.slice(r.start, r.end)).toBe('Łódź')
  })
  it('maps back through decomposed text whose length changed on folding', () => {
    const text = 'x Łád y' // a + combining acute
    const m = foldMapped(text)
    expect(m.folded.length).toBeLessThan(text.length)
    const at = m.folded.indexOf('lad')
    const r = originalRange(text, m, at, at + 3)
    expect(text.slice(r.start, r.end)).toBe('Łád')
  })
  it('is the identity for plain ASCII', () => {
    const text = 'Hello World'
    const m = foldMapped(text)
    expect(originalRange(text, m, 6, 11)).toEqual({ start: 6, end: 11 })
  })
})
