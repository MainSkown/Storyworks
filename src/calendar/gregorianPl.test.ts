import { describe, expect, it } from 'vitest'
import { gregorianCalendar } from './gregorian'
import { calendarSchema } from './schema'

describe('Polish Gregorian preset', () => {
  it('is valid and has the same shape as English', () => {
    const pl = gregorianCalendar('x', 'pl')
    expect(calendarSchema.safeParse(pl).success).toBe(true)
    expect(pl.months[0].name).toBe('styczeń')
    expect(pl.months.map((m) => m.days)).toEqual(gregorianCalendar('x').months.map((m) => m.days))
    expect(pl.weekdays).toHaveLength(7)
  })
})
