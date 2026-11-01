import { describe, expect, it } from 'vitest'
import { gregorianCalendar } from './gregorian'
import { calendarSchema, type Calendar } from './schema'
import {
  compareDates,
  eraOf,
  formatDate,
  isLeapYear,
  parseDateInput,
  toOrdinal,
  validateDate,
  yearLength,
} from './dates'

const greg = gregorianCalendar('g')
const noLeap: Calendar = { ...greg, leap: null }
const d = (year: number, month: number, day: number) => ({ year, month, day })

// 13 months of 28 days, leap day every 5 years in the last month
const lunar: Calendar = calendarSchema.parse({
  version: 1,
  id: 'l',
  months: Array.from({ length: 13 }, (_, i) => ({ name: `Moon ${i + 1}`, days: 28 })),
  weekdays: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  eras: [
    { name: 'Old Age', startYear: -100 },
    { name: 'New Age', startYear: 1 },
  ],
  epochLabel: 'since the Fall',
  leap: { month: 12, extraDays: 2, every: 5 },
})

describe('leap years', () => {
  it('Gregorian rule', () => {
    expect(isLeapYear(greg, 1900)).toBe(false)
    expect(isLeapYear(greg, 2000)).toBe(true)
    expect(isLeapYear(greg, 2024)).toBe(true)
    expect(isLeapYear(greg, 2023)).toBe(false)
  })
  it('off: every year has the same length', () => {
    expect(isLeapYear(noLeap, 2024)).toBe(false)
    expect(yearLength(noLeap, 2024)).toBe(365)
    expect(yearLength(noLeap, 2023)).toBe(365)
  })
  it('on: leap year is longer by the extra days', () => {
    expect(yearLength(greg, 2024)).toBe(366)
    expect(yearLength(lunar, 5)).toBe(13 * 28 + 2)
  })
  it('works for years at or below 0', () => {
    expect(isLeapYear(greg, 0)).toBe(true)
    expect(isLeapYear(greg, -4)).toBe(true)
    expect(isLeapYear(greg, -100)).toBe(false)
    expect(isLeapYear(greg, -3)).toBe(false)
  })
})

describe('validateDate', () => {
  it('rejects 30 Feb', () => {
    expect(validateDate(greg, d(2023, 1, 30))).toEqual({ ok: false, reason: 'day' })
  })
  it('rejects month out of range', () => {
    expect(validateDate(greg, d(2023, 12, 1))).toEqual({ ok: false, reason: 'month' })
    expect(validateDate(greg, d(2023, -1, 1))).toEqual({ ok: false, reason: 'month' })
  })
  it('rejects day 0 and day over the month length', () => {
    expect(validateDate(greg, d(2023, 0, 0))).toEqual({ ok: false, reason: 'day' })
    expect(validateDate(greg, d(2023, 0, 32))).toEqual({ ok: false, reason: 'day' })
  })
  it('rejects non-integer parts', () => {
    expect(validateDate(greg, d(1.5, 0, 1))).toEqual({ ok: false, reason: 'year' })
    expect(validateDate(greg, d(2023, 0, 1.5))).toEqual({ ok: false, reason: 'day' })
  })
  it('29 Feb is valid in a leap year only', () => {
    expect(validateDate(greg, d(2024, 1, 29)).ok).toBe(true)
    expect(validateDate(greg, d(2023, 1, 29)).ok).toBe(false)
    expect(validateDate(greg, d(1900, 1, 29)).ok).toBe(false)
  })
  it('with leap off, 29 Feb is invalid in every year', () => {
    for (const y of [2023, 2024, 2000, -4, 0])
      expect(validateDate(noLeap, d(y, 1, 29)).ok).toBe(false)
  })
  it('accepts years at or below 0', () => {
    expect(validateDate(greg, d(-50, 5, 10)).ok).toBe(true)
    expect(validateDate(greg, d(0, 0, 1)).ok).toBe(true)
  })
})

describe('toOrdinal', () => {
  it('year 0 day 1 of month 0 is ordinal 0', () => {
    expect(toOrdinal(greg, d(0, 0, 1))).toBe(0)
    expect(toOrdinal(noLeap, d(0, 0, 1))).toBe(0)
  })
  it('counts days within a year', () => {
    expect(toOrdinal(noLeap, d(0, 1, 1))).toBe(31)
    expect(toOrdinal(noLeap, d(1, 0, 1))).toBe(365)
  })
  it('leap on shifts later ordinals by the extra day', () => {
    expect(toOrdinal(greg, d(1, 0, 1))).toBe(366) // year 0 is leap
    expect(toOrdinal(greg, d(0, 2, 1))).toBe(31 + 29)
    expect(toOrdinal(noLeap, d(0, 2, 1))).toBe(31 + 28)
  })
  it('years below 0 give negative ordinals', () => {
    expect(toOrdinal(noLeap, d(-1, 0, 1))).toBe(-365)
    expect(toOrdinal(greg, d(-1, 0, 1))).toBe(-365) // year -1 is not leap
    expect(toOrdinal(greg, d(-4, 0, 1))).toBe(-(365 * 3 + 366))
  })
  it('matches a day-by-day walk, including century years', () => {
    for (const cal of [greg, noLeap, lunar]) {
      let ord = toOrdinal(cal, d(-405, 0, 1))
      for (let y = -405; y <= 405; y++) {
        expect(toOrdinal(cal, d(y, 0, 1))).toBe(ord)
        for (let m = 0; m < cal.months.length; m++) {
          const base = cal.months[m].days
          const len = base + (isLeapYear(cal, y) && cal.leap?.month === m ? cal.leap.extraDays : 0)
          expect(toOrdinal(cal, d(y, m, len)) - toOrdinal(cal, d(y, m, 1))).toBe(len - 1)
        }
        ord += yearLength(cal, y)
      }
    }
  })
  it('works on a custom 13-month calendar', () => {
    expect(toOrdinal(lunar, d(0, 12, 28))).toBe(12 * 28 + 27)
    expect(toOrdinal(lunar, d(1, 0, 1))).toBe(13 * 28 + 2) // year 0 is leap (0 % 5 === 0)
  })
})

describe('compareDates', () => {
  it('orders by the calendar', () => {
    expect(compareDates(greg, d(2000, 1, 28), d(2000, 1, 29))).toBe(-1)
    expect(compareDates(greg, d(2000, 2, 1), d(2000, 1, 29))).toBe(1)
    expect(compareDates(greg, d(2000, 1, 29), d(2000, 1, 29))).toBe(0)
  })
  it('orders years at or below 0', () => {
    expect(compareDates(greg, d(-3, 11, 31), d(0, 0, 1))).toBe(-1)
    expect(compareDates(greg, d(-1, 0, 1), d(-2, 11, 31))).toBe(1)
  })
  it('orders on a custom calendar', () => {
    expect(compareDates(lunar, d(3, 12, 28), d(4, 0, 1))).toBe(-1)
  })
  it('never orders an invalid date', () => {
    expect(compareDates(greg, d(2023, 1, 30), d(2023, 2, 1))).toBeNull()
    expect(compareDates(greg, d(2023, 2, 1), d(2023, 1, 30))).toBeNull()
  })
})

describe('eras and formatting', () => {
  it('era is the one with the largest startYear at or below the year', () => {
    expect(eraOf(lunar, 1)).toEqual({ name: 'New Age', year: 1 })
    expect(eraOf(lunar, 10)).toEqual({ name: 'New Age', year: 10 })
    expect(eraOf(lunar, 0)).toEqual({ name: 'Old Age', year: 101 })
    expect(eraOf(lunar, -100)).toEqual({ name: 'Old Age', year: 1 })
    expect(eraOf(lunar, -101)).toBeNull()
    expect(eraOf(greg, 5)).toBeNull()
  })
  it('formats with month name and era year', () => {
    expect(formatDate(lunar, d(10, 2, 5))).toBe('5 Moon 3 10 New Age')
  })
  it('falls back to the epoch label, then to the bare year', () => {
    expect(formatDate(lunar, d(-200, 0, 1))).toBe('1 Moon 1 -200 since the Fall')
    expect(formatDate(greg, d(2024, 1, 29))).toBe('29 February 2024')
  })
  it('shows an out-of-range month as a number instead of throwing', () => {
    expect(formatDate(greg, d(2024, 14, 3))).toContain('3')
  })
})

describe('parseDateInput', () => {
  it('round-trips valid dates', () => {
    for (const cal of [greg, lunar]) {
      for (const date of [d(10, 2, 5), d(-200, 0, 1), d(0, 12, 28), d(2024, 1, 2)]) {
        if (!validateDate(cal, date).ok) continue
        expect(parseDateInput(cal, formatDate(cal, date))).toEqual({ ok: true, date })
      }
    }
  })
  it('is case-insensitive and tolerant of extra spaces', () => {
    expect(parseDateInput(greg, '  3   march  2001 ')).toEqual({ ok: true, date: d(2001, 2, 3) })
  })
  it('handles era years and bare years', () => {
    expect(parseDateInput(lunar, '1 Moon 1 5 Old Age')).toEqual({ ok: true, date: d(-96, 0, 1) })
    expect(parseDateInput(lunar, '1 Moon 1 7')).toEqual({ ok: true, date: d(7, 0, 1) })
  })
  it('reports why input failed', () => {
    expect(parseDateInput(greg, 'soon')).toEqual({ ok: false, reason: 'format' })
    expect(parseDateInput(greg, '3 Smarch 2001')).toEqual({ ok: false, reason: 'month' })
    expect(parseDateInput(greg, '30 February 2001')).toEqual({ ok: false, reason: 'day' })
    expect(parseDateInput(lunar, '1 Moon 1 5 Lost Age')).toEqual({ ok: false, reason: 'era' })
  })
})
