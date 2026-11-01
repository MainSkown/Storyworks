import { describe, expect, it } from 'vitest'
import { gregorianCalendar } from '../calendar'
import { dateToInput, readDateInput } from './dateInput'

const cal = gregorianCalendar('g')

describe('readDateInput', () => {
  it('empty input clears the date', () => {
    expect(readDateInput(cal, '   ')).toEqual({ kind: 'clear' })
  })
  it('valid input gives the date', () => {
    expect(readDateInput(cal, '12 March 1400')).toEqual({
      kind: 'set',
      date: { year: 1400, month: 2, day: 12 },
    })
  })
  it('a day that does not exist is an error, not a date', () => {
    expect(readDateInput(cal, '30 February 1400')).toEqual({ kind: 'error', reason: 'day' })
  })
  it('garbage is a format error', () => {
    expect(readDateInput(cal, 'sometime')).toEqual({ kind: 'error', reason: 'format' })
  })
})

describe('dateToInput', () => {
  it('formats a stored date and gives empty text for none', () => {
    expect(dateToInput(cal, null)).toBe('')
    expect(dateToInput(cal, { year: 1400, month: 2, day: 12 })).toBe('12 March 1400')
  })
  it('round-trips through the parser', () => {
    const date = { year: 2000, month: 1, day: 29 }
    expect(readDateInput(cal, dateToInput(cal, date))).toEqual({ kind: 'set', date })
  })
})
