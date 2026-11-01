import { describe, expect, it } from 'vitest'
import { parseFile, serialize } from '../project/serialize'
import { calendarSchema, type Calendar } from './schema'
import { GREGORIAN_LEAP, gregorianCalendar } from './gregorian'

const cal = (patch: Record<string, unknown>) => ({ ...gregorianCalendar('c1'), ...patch })
const bad = (patch: Record<string, unknown>) => calendarSchema.safeParse(cal(patch)).success

describe('calendar schema', () => {
  it('Gregorian preset is valid', () => {
    expect(calendarSchema.safeParse(gregorianCalendar('c1')).success).toBe(true)
  })
  it('Gregorian preset has 12 months, weekdays and the leap rule on', () => {
    const g = gregorianCalendar('c1')
    expect(g.months).toHaveLength(12)
    expect(g.weekdays).toHaveLength(7)
    expect(g.leap).toEqual(GREGORIAN_LEAP)
  })
  it('rejects a month with zero days', () => {
    expect(bad({ months: [{ name: 'A', days: 0 }] })).toBe(false)
  })
  it('rejects empty months', () => {
    expect(bad({ months: [] })).toBe(false)
  })
  it('rejects duplicate month names', () => {
    expect(
      bad({
        months: [
          { name: 'A', days: 10 },
          { name: 'a', days: 10 },
        ],
      }),
    ).toBe(false)
  })
  it('rejects a blank month name', () => {
    expect(bad({ months: [{ name: ' ', days: 10 }] })).toBe(false)
  })
  it('rejects a leap month outside the months', () => {
    expect(bad({ leap: { month: 12, extraDays: 1, every: 4 } })).toBe(false)
  })
  it('rejects non-positive leap numbers', () => {
    expect(bad({ leap: { month: 1, extraDays: 0, every: 4 } })).toBe(false)
    expect(bad({ leap: { month: 1, extraDays: 1, every: 0 } })).toBe(false)
  })
  it('rejects unlessEvery without exceptEvery', () => {
    expect(bad({ leap: { month: 1, extraDays: 1, every: 4, unlessEvery: 400 } })).toBe(false)
  })
  it('accepts leap null (off) and an empty weekday list', () => {
    expect(bad({ leap: null, weekdays: [] })).toBe(true)
  })
  it('leap defaults to off when missing', () => {
    const rest: Record<string, unknown> = { ...gregorianCalendar('c1') }
    delete rest.leap
    const r = calendarSchema.parse(rest)
    expect(r.leap).toBeNull()
  })
  it('rejects unknown keys and a wrong version', () => {
    expect(bad({ extra: 1 })).toBe(false)
    expect(bad({ version: 2 })).toBe(false)
  })
  it('rejects duplicate era names', () => {
    expect(
      bad({
        eras: [
          { name: 'A', startYear: 0 },
          { name: 'A', startYear: 10 },
        ],
      }),
    ).toBe(false)
  })
  it('serialize round-trips and malformed text is rejected', () => {
    const g = gregorianCalendar('c1')
    const r = parseFile(calendarSchema, serialize(calendarSchema, g), 'calendar.json')
    expect(r).toEqual({ ok: true, value: g })
    expect(parseFile(calendarSchema, '{"version":1}', 'calendar.json').ok).toBe(false)
    expect(parseFile(calendarSchema, 'nope', 'calendar.json').ok).toBe(false)
  })
  it('keeps stored key order from the schema', () => {
    const c: Calendar = gregorianCalendar('c1')
    const keys = Object.keys(JSON.parse(serialize(calendarSchema, c)))
    expect(keys.slice(0, 3)).toEqual(['version', 'id', 'months'])
  })
})
