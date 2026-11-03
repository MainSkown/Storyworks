import { describe, expect, it } from 'vitest'
import { moveActive } from './nav'

describe('moveActive', () => {
  it('wraps around both ways', () => {
    expect(moveActive(2, 1, 3)).toBe(0)
    expect(moveActive(0, -1, 3)).toBe(2)
    expect(moveActive(0, 1, 3)).toBe(1)
  })
  it('stays at 0 with no items', () => {
    expect(moveActive(0, 1, 0)).toBe(0)
  })
})
