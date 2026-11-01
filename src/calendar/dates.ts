import type { Calendar, CalendarDate } from './schema'

export type DateProblem = 'year' | 'month' | 'day'
export type DateCheck = { ok: true } | { ok: false; reason: DateProblem }
export type ParseProblem = DateProblem | 'format' | 'era'
export type ParseDateResult = { ok: true; date: CalendarDate } | { ok: false; reason: ParseProblem }

const mod = (a: number, n: number) => ((a % n) + n) % n
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b

export function isLeapYear(cal: Calendar, year: number): boolean {
  const l = cal.leap
  if (!l || mod(year, l.every) !== 0) return false
  if (l.exceptEvery === undefined || mod(year, l.exceptEvery) !== 0) return true
  return l.unlessEvery !== undefined && mod(year, l.unlessEvery) === 0
}

export function monthLength(cal: Calendar, year: number, month: number): number {
  const extra =
    cal.leap && cal.leap.month === month && isLeapYear(cal, year) ? cal.leap.extraDays : 0
  return cal.months[month].days + extra
}

const baseYearLength = (cal: Calendar) => cal.months.reduce((n, m) => n + m.days, 0)

export function yearLength(cal: Calendar, year: number): number {
  return baseYearLength(cal) + (cal.leap && isLeapYear(cal, year) ? cal.leap.extraDays : 0)
}

/** Leap years in [from, to] (0 when from > to), without looping. */
function leapYearsBetween(cal: Calendar, from: number, to: number): number {
  const l = cal.leap
  if (!l || from > to) return 0
  const div = (m: number) => Math.floor(to / m) - Math.floor((from - 1) / m)
  let count = div(l.every)
  if (l.exceptEvery !== undefined) {
    const ex = lcm(l.every, l.exceptEvery)
    count -= div(ex)
    if (l.unlessEvery !== undefined) count += div(lcm(ex, l.unlessEvery))
  }
  return count
}

export function validateDate(cal: Calendar, date: CalendarDate): DateCheck {
  if (!Number.isInteger(date.year)) return { ok: false, reason: 'year' }
  if (!Number.isInteger(date.month) || date.month < 0 || date.month >= cal.months.length)
    return { ok: false, reason: 'month' }
  if (
    !Number.isInteger(date.day) ||
    date.day < 1 ||
    date.day > monthLength(cal, date.year, date.month)
  )
    return { ok: false, reason: 'day' }
  return { ok: true }
}

/** Days since the first day of year 0 (day 1 of month 0). Assumes a valid date. */
export function toOrdinal(cal: Calendar, date: CalendarDate): number {
  const { year } = date
  const leaps = year >= 0 ? leapYearsBetween(cal, 0, year - 1) : -leapYearsBetween(cal, year, -1)
  let days = baseYearLength(cal) * year + (cal.leap?.extraDays ?? 0) * leaps
  for (let m = 0; m < date.month; m++) days += monthLength(cal, year, m)
  return days + date.day - 1
}

/** -1, 0 or 1; null when either date does not exist in the calendar (invalid dates are never ordered). */
export function compareDates(cal: Calendar, a: CalendarDate, b: CalendarDate): -1 | 0 | 1 | null {
  if (!validateDate(cal, a).ok || !validateDate(cal, b).ok) return null
  const diff = toOrdinal(cal, a) - toOrdinal(cal, b)
  return diff < 0 ? -1 : diff > 0 ? 1 : 0
}

/** The era with the largest startYear <= year, and the year counted from it (startYear = year 1). */
export function eraOf(cal: Calendar, year: number): { name: string; year: number } | null {
  let best: Calendar['eras'][number] | null = null
  for (const e of cal.eras)
    if (e.startYear <= year && (!best || e.startYear > best.startYear)) best = e
  return best ? { name: best.name, year: year - best.startYear + 1 } : null
}

/** "5 Moon 3 10 New Age"; years outside every era use the epoch label (if any). */
export function formatDate(cal: Calendar, date: CalendarDate): string {
  const month = cal.months[date.month]?.name ?? String(date.month + 1)
  const era = eraOf(cal, date.year)
  const tail = era
    ? `${era.year} ${era.name}`
    : [String(date.year), cal.epochLabel].filter(Boolean).join(' ')
  return `${date.day} ${month} ${tail}`
}

/** Inverse of formatDate (case-insensitive). The result is checked with validateDate. */
export function parseDateInput(cal: Calendar, input: string): ParseDateResult {
  const head = /^(\d+)\s+(.+)$/.exec(input.trim())
  if (!head) return { ok: false, reason: 'format' }
  const rest = head[2].replace(/\s+/g, ' ')
  // Month names may contain spaces or digits, so try the longest match first.
  const months = cal.months
    .map((m, i) => ({ i, name: m.name.trim().replace(/\s+/g, ' ').toLowerCase() }))
    .sort((a, b) => b.name.length - a.name.length)
  const lower = rest.toLowerCase()
  const hit = months.find((m) => lower === m.name || lower.startsWith(`${m.name} `))
  if (!hit) return { ok: false, reason: /^\S+\s+-?\d+(\s|$)/.test(rest) ? 'month' : 'format' }
  const tail = /^(-?\d+)(?: (.+))?$/.exec(rest.slice(hit.name.length).trim())
  if (!tail) return { ok: false, reason: 'format' }
  let year = Number(tail[1])
  const label = tail[2]?.toLowerCase()
  if (label !== undefined && label !== cal.epochLabel?.trim().toLowerCase()) {
    const era = cal.eras.find((e) => e.name.trim().replace(/\s+/g, ' ').toLowerCase() === label)
    if (!era) return { ok: false, reason: 'era' }
    year = era.startYear + year - 1
  }
  const date = { year, month: hit.i, day: Number(head[1]) }
  const check = validateDate(cal, date)
  return check.ok ? { ok: true, date } : check
}
