import { describe, expect, it } from 'vitest'
import { mentionSegments } from './mentionView'

describe('mentionSegments', () => {
  it('splits text into plain and matched parts', () => {
    const text = 'Anna met Anna.'
    const segs = mentionSegments(text, [
      { start: 0, end: 4 },
      { start: 9, end: 13 },
    ])
    expect(segs).toEqual([
      { text: 'Anna', hit: true },
      { text: ' met ', hit: false },
      { text: 'Anna', hit: true },
      { text: '.', hit: false },
    ])
  })

  it('returns the whole text when nothing matches', () => {
    expect(mentionSegments('hi', [])).toEqual([{ text: 'hi', hit: false }])
  })

  it('trims a long text to a window around the first match', () => {
    const text = `${'x'.repeat(300)} Anna ${'y'.repeat(300)}`
    const segs = mentionSegments(text, [{ start: 301, end: 305 }], 100)
    const joined = segs.map((s) => s.text).join('')
    expect(joined.length).toBeLessThan(130)
    expect(segs.find((s) => s.hit)?.text).toBe('Anna')
    expect(joined.startsWith('…')).toBe(true)
    expect(joined.endsWith('…')).toBe(true)
  })

  it('drops ranges cut off by the window', () => {
    const text = `Anna ${'x'.repeat(300)} Anna`
    const segs = mentionSegments(
      text,
      [
        { start: 0, end: 4 },
        { start: 306, end: 310 },
      ],
      100,
    )
    expect(segs.filter((s) => s.hit)).toHaveLength(1)
  })
})
