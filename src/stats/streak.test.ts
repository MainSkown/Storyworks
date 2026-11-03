import { describe, expect, it } from 'vitest'
import { streaks } from './streak'

const d = (...rows: [string, number][]) => rows.map(([date, net]) => ({ date, net }))

describe('streaks with a goal', () => {
  const days = d(['2026-06-01', 500], ['2026-06-02', 600], ['2026-06-03', 499], ['2026-06-04', 500])

  it('only days meeting the goal count', () => {
    expect(streaks(days, '2026-06-04', 500)).toEqual({ current: 1, longest: 2 })
  })

  it('today not yet met does not break the streak', () => {
    expect(streaks(d(['2026-06-02', 500], ['2026-06-03', 500], ['2026-06-04', 10]), '2026-06-04', 500)).toEqual({
      current: 2,
      longest: 2,
    })
  })

  it('a missed day before today breaks it', () => {
    expect(streaks(d(['2026-06-01', 500], ['2026-06-03', 500]), '2026-06-04', 500).current).toBe(1)
    expect(streaks(d(['2026-06-01', 500]), '2026-06-04', 500).current).toBe(0)
  })
})

describe('streaks without a goal', () => {
  it('one word is enough; negative net days do not count', () => {
    const days = d(['2026-06-01', 1], ['2026-06-02', 40], ['2026-06-03', -5], ['2026-06-04', 2])
    expect(streaks(days, '2026-06-04', null)).toEqual({ current: 1, longest: 2 })
    expect(streaks(days, '2026-06-04', 0).longest).toBe(2)
  })
})

describe('streak edge cases', () => {
  it('no days gives zeros', () => {
    expect(streaks([], '2026-06-04', null)).toEqual({ current: 0, longest: 0 })
  })

  it('longest can be longer than current', () => {
    const days = d(['2026-05-01', 9], ['2026-05-02', 9], ['2026-05-03', 9], ['2026-06-03', 9], ['2026-06-04', 9])
    expect(streaks(days, '2026-06-04', null)).toEqual({ current: 2, longest: 3 })
  })

  it('counts across month and year ends', () => {
    const days = d(['2025-12-30', 9], ['2025-12-31', 9], ['2026-01-01', 9])
    expect(streaks(days, '2026-01-01', null)).toEqual({ current: 3, longest: 3 })
  })
})
