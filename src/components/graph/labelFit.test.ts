import { describe, expect, it } from 'vitest'
import { fitLabel, MAX_LABEL } from './labelFit'

describe('fitLabel', () => {
  it('keeps a short label whole', () => {
    expect(fitLabel('Yes', 200)).toBe('Yes')
  })

  it('cuts a long label to fit a wide gap, never past the global maximum', () => {
    const long = 'x'.repeat(60)
    expect(fitLabel(long, 1000).length).toBe(MAX_LABEL)
  })

  it('cuts harder in a narrow gap, with an ellipsis', () => {
    const out = fitLabel('Report to the captain', 120)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThan(13)
  })

  it('keeps a few characters even with no gap', () => {
    expect(fitLabel('Report to the captain', 0).length).toBe(5)
  })
})
