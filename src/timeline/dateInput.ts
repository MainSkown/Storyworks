import {
  formatDate,
  parseDateInput,
  type Calendar,
  type CalendarDate,
  type ParseProblem,
} from '../calendar'

export type DateInputResult =
  { kind: 'clear' } | { kind: 'set'; date: CalendarDate } | { kind: 'error'; reason: ParseProblem }

/** Text typed in the date field -> what to do with the node's date. */
export function readDateInput(cal: Calendar, text: string): DateInputResult {
  if (text.trim() === '') return { kind: 'clear' }
  const r = parseDateInput(cal, text)
  return r.ok ? { kind: 'set', date: r.date } : { kind: 'error', reason: r.reason }
}

export const dateToInput = (cal: Calendar, date: CalendarDate | null): string =>
  date ? formatDate(cal, date) : ''
