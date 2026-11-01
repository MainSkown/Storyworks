import { describe, expect, it } from 'vitest'
import { gregorianCalendar } from './gregorian'
import { flagInvalidDates, datesNoLongerFitting } from './flag'

const greg = gregorianCalendar('g')
const d = (year: number, month: number, day: number) => ({ year, month, day })

describe('calendar change flags dates that no longer fit', () => {
  const items = [
    { id: 'a', date: d(2023, 0, 31) },
    { id: 'b', date: d(2023, 1, 29) },
    { id: 'c', date: null },
    { id: 'd', date: d(2024, 1, 29) },
  ]
  it('flags only dates invalid in the calendar', () => {
    expect(flagInvalidDates(greg, items)).toEqual([{ id: 'b', reason: 'day' }])
  })
  it('after shortening January, a day-31 date is flagged; stored dates stay as they were', () => {
    const before = JSON.stringify(items)
    const short = { ...greg, months: greg.months.map((m, i) => (i === 0 ? { ...m, days: 30 } : m)) }
    expect(flagInvalidDates(short, items).map((f) => f.id)).toEqual(['a', 'b'])
    expect(JSON.stringify(items)).toBe(before)
  })
  it('turning leap years off flags 29 Feb', () => {
    expect(flagInvalidDates({ ...greg, leap: null }, items).map((f) => f.id)).toEqual(['b', 'd'])
  })
  it('counts only dates that were valid before and are not now', () => {
    const next = { ...greg, leap: null }
    expect(datesNoLongerFitting(greg, next, items)).toEqual([{ id: 'd', reason: 'day' }])
  })
  it('finds nothing for a good case', () => {
    expect(flagInvalidDates(greg, [{ id: 'x', date: d(2000, 5, 15) }])).toEqual([])
  })
})
