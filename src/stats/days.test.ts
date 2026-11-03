import { describe, expect, it } from 'vitest'
import { addToDay, dayKey, displayNet, goalMet, netOn } from './days'

const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

describe('days', () => {
  it('dayKey uses the local calendar day', () => {
    expect(dayKey(at(2026, 6, 1, 0, 0))).toBe('2026-06-01')
    expect(dayKey(at(2026, 6, 1, 23, 59))).toBe('2026-06-01')
    expect(dayKey(at(2026, 6, 2, 0, 0))).toBe('2026-06-02')
  })

  it('adds deltas to the day of their timestamp, deletions subtract', () => {
    let days = addToDay([], at(2026, 6, 1), 10)
    days = addToDay(days, at(2026, 6, 1, 15), -4)
    expect(days).toEqual([{ date: '2026-06-01', net: 6 }])
  })

  it('a midnight rollover splits deltas between the two days', () => {
    let days = addToDay([], at(2026, 6, 1, 23, 58), 5)
    days = addToDay(days, at(2026, 6, 2, 0, 3), 7)
    expect(days).toEqual([
      { date: '2026-06-01', net: 5 },
      { date: '2026-06-02', net: 7 },
    ])
  })

  it('keeps days sorted and does not mutate the input', () => {
    const input = [{ date: '2026-06-05', net: 1 }]
    const out = addToDay(input, at(2026, 6, 1), 2)
    expect(out.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-05'])
    expect(input).toHaveLength(1)
  })

  it('an empty day shows 0 and a negative day shows 0', () => {
    expect(netOn([], '2026-06-01')).toBe(0)
    expect(displayNet(-8)).toBe(0)
    expect(netOn([{ date: '2026-06-01', net: -8 }], '2026-06-01')).toBe(0)
  })

  it('goal met needs the displayed value to reach the goal; no goal means never "met"', () => {
    expect(goalMet(500, 500)).toBe(true)
    expect(goalMet(499, 500)).toBe(false)
    expect(goalMet(-3, 500)).toBe(false)
    expect(goalMet(1000, null)).toBe(false)
    expect(goalMet(1000, 0)).toBe(false)
  })
})
