import { expect, it } from 'vitest'
import { localStamp } from './stamp'

it('formats local time with zero padding', () => {
  expect(localStamp(new Date(2026, 0, 5, 7, 4))).toBe('2026-01-05 07:04')
})
