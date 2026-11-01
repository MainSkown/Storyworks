import { validateDate, type DateProblem } from './dates'
import type { Calendar, CalendarDate } from './schema'

export interface DatedItem {
  id: string
  date: CalendarDate | null
}
export interface DateFlag {
  id: string
  reason: DateProblem
}

/** Items whose date does not exist in the calendar. Pure: the items are never changed. */
export function flagInvalidDates(cal: Calendar, items: DatedItem[]): DateFlag[] {
  const out: DateFlag[] = []
  for (const { id, date } of items) {
    if (!date) continue
    const r = validateDate(cal, date)
    if (!r.ok) out.push({ id, reason: r.reason })
  }
  return out
}

/** Dates that fit `before` but not `after`: the "N dates will no longer fit" count. */
export function datesNoLongerFitting(
  before: Calendar,
  after: Calendar,
  items: DatedItem[],
): DateFlag[] {
  const wasFlagged = new Set(flagInvalidDates(before, items).map((f) => f.id))
  return flagInvalidDates(after, items).filter((f) => !wasFlagged.has(f.id))
}
