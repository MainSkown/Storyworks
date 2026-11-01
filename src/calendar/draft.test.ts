import { describe, expect, it } from 'vitest'
import {
  addMonth,
  moveMonth,
  removeMonth,
  toDraft,
  validateDraft,
  type CalendarDraft,
} from './draft'
import { gregorianCalendar } from './gregorian'

const greg = () => toDraft(gregorianCalendar('c1'))
const names = (d: CalendarDraft) => d.months.map((m) => m.name)

describe('calendar draft', () => {
  it('round-trips the Gregorian preset', () => {
    const r = validateDraft(greg())
    expect(r.ok && r.calendar).toEqual(gregorianCalendar('c1'))
  })

  it('moves a month and the leap month follows it', () => {
    const d = moveMonth(greg(), 1, -1)
    expect(names(d).slice(0, 2)).toEqual(['February', 'January'])
    expect(d.leap.month).toBe(0)
    expect(moveMonth(d, 0, -1)).toBe(d)
  })

  it('moving another month over the leap month shifts it', () => {
    expect(moveMonth(greg(), 0, 1).leap.month).toBe(0)
  })

  it('removing a month before the leap month shifts the leap month', () => {
    const d = removeMonth(greg(), 0)
    expect(d.months).toHaveLength(11)
    expect(d.leap.month).toBe(0)
    expect(d.months[d.leap.month].name).toBe('February')
  })

  it('removing the leap month keeps the leap month in range', () => {
    const d = removeMonth(greg(), 1)
    expect(d.months[d.leap.month].name).toBe('March')
    const last = removeMonth(greg(), 11)
    expect(removeMonth(removeMonth(last, 10), 9).leap.month).toBe(1)
  })

  it('keeps the last month', () => {
    let d = greg()
    for (let i = 0; i < 20; i++) d = removeMonth(d, 0)
    expect(d.months).toHaveLength(1)
  })

  it('adds a month with a unique name', () => {
    const d = addMonth(addMonth(greg()))
    expect(new Set(names(d)).size).toBe(14)
  })

  it('reports field-level errors', () => {
    const d = greg()
    d.months[2].name = '  '
    d.months[3].days = 0
    d.months[4].days = NaN
    const r = validateDraft(d)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors['months.2.name']).toBe('calendar.err.blank')
      expect(r.errors['months.3.days']).toBe('calendar.err.days')
      expect(r.errors['months.4.days']).toBe('calendar.err.days')
    }
  })

  it('reports duplicate month names on the table', () => {
    const d = greg()
    d.months[1].name = 'january'
    const r = validateDraft(d)
    expect(!r.ok && r.errors['months']).toBe('calendar.err.monthsUnique')
  })

  it('ignores leap values while the switch is off, and keeps them', () => {
    const d = { ...greg(), leapOn: false }
    d.leap = { ...d.leap, every: 0 }
    const r = validateDraft(d)
    expect(r.ok && r.calendar.leap).toBeNull()
    expect(d.leap.every).toBe(0)
  })

  it('validates leap fields while the switch is on', () => {
    const d = greg()
    d.leap = { ...d.leap, every: 0, month: 40 }
    const r = validateDraft(d)
    expect(!r.ok && r.errors['leap.every']).toBe('calendar.err.positiveInt')
    expect(!r.ok && r.errors['leap.month']).toBe('calendar.err.leapMonth')
  })

  it('omits a blank epoch label', () => {
    const d = { ...greg(), epochLabel: '  ' }
    const r = validateDraft(d)
    expect(r.ok && 'epochLabel' in r.calendar).toBe(false)
  })
})
