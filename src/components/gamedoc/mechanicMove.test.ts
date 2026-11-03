import { describe, expect, it } from 'vitest'
import { neighborIndex } from './mechanicMove'

describe('neighborIndex', () => {
  const all = ['a', 'b', 'c', 'd']
  it('moves within the full list', () => {
    expect(neighborIndex(all, all, 'c', -1)).toBe(1)
    expect(neighborIndex(all, all, 'b', 1)).toBe(2)
  })
  it('skips hidden items when filtered', () => {
    expect(neighborIndex(all, ['a', 'd'], 'd', -1)).toBe(0)
  })
  it('returns null at the ends or for unknown ids', () => {
    expect(neighborIndex(all, all, 'a', -1)).toBeNull()
    expect(neighborIndex(all, all, 'd', 1)).toBeNull()
    expect(neighborIndex(all, all, 'x', 1)).toBeNull()
  })
})
