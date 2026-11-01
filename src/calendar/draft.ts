import { calendarSchema, type Calendar, type LeapRule } from './schema'

export interface LeapDraft {
  month: number
  extraDays: number
  every: number
  exceptEvery?: number
  unlessEvery?: number
}

/** Editable copy of a calendar. `leap` is kept while `leapOn` is false so toggling back restores it. */
export interface CalendarDraft {
  id: string
  months: { name: string; days: number }[]
  weekdays: string[]
  eras: { name: string; startYear: number }[]
  epochLabel: string
  leapOn: boolean
  leap: LeapDraft
}

const DEFAULT_LEAP: LeapDraft = { month: 0, extraDays: 1, every: 4 }

export function toDraft(cal: Calendar): CalendarDraft {
  return {
    id: cal.id,
    months: cal.months.map((m) => ({ ...m })),
    weekdays: [...cal.weekdays],
    eras: cal.eras.map((e) => ({ ...e })),
    epochLabel: cal.epochLabel ?? '',
    leapOn: cal.leap !== null,
    leap: { ...(cal.leap ?? DEFAULT_LEAP) },
  }
}

export type DraftResult =
  { ok: true; calendar: Calendar } | { ok: false; errors: Record<string, string> }

function errorKey(path: PropertyKey[], code: string): string {
  const [head, , field] = path
  const tail = path[path.length - 1]
  const blank = 'calendar.err.blank'
  if (head === 'months') {
    if (path.length === 1)
      return code === 'too_small' ? 'calendar.err.noMonths' : 'calendar.err.monthsUnique'
    return field === 'days' ? 'calendar.err.days' : blank
  }
  if (head === 'weekdays') return path.length === 1 ? 'calendar.err.weekdaysUnique' : blank
  if (head === 'eras') {
    if (path.length === 1) return 'calendar.err.erasUnique'
    return field === 'startYear' ? 'calendar.err.year' : blank
  }
  if (tail === 'month') return 'calendar.err.leapMonth'
  if (tail === 'unlessEvery' && code === 'custom') return 'calendar.err.unlessNeedsExcept'
  return 'calendar.err.positiveInt'
}

/** Validates through `calendarSchema`; errors map a field path ("months.2.days") to an i18n key. */
export function validateDraft(d: CalendarDraft): DraftResult {
  const leap: LeapRule | null = d.leapOn
    ? (Object.fromEntries(Object.entries(d.leap).filter(([, v]) => v !== undefined)) as LeapRule)
    : null
  const label = d.epochLabel.trim()
  const r = calendarSchema.safeParse({
    version: 1,
    id: d.id,
    months: d.months,
    weekdays: d.weekdays,
    eras: d.eras,
    ...(label ? { epochLabel: label } : {}),
    leap,
  })
  if (r.success) return { ok: true, calendar: r.data }
  const errors: Record<string, string> = {}
  for (const i of r.error.issues) errors[i.path.join('.')] ??= errorKey(i.path, i.code)
  return { ok: false, errors }
}

function moved<T>(list: T[], i: number, delta: number): T[] | null {
  const j = i + delta
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return null
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

const without = <T>(list: T[], i: number): T[] => list.filter((_, k) => k !== i)

export function addMonth(d: CalendarDraft): CalendarDraft {
  const used = new Set(d.months.map((m) => m.name.trim().toLowerCase()))
  let n = d.months.length + 1
  while (used.has(`month ${n}`)) n++
  return { ...d, months: [...d.months, { name: `Month ${n}`, days: 30 }] }
}

/** The last month cannot be removed. The leap month keeps pointing at the same month (or stays in range). */
export function removeMonth(d: CalendarDraft, i: number): CalendarDraft {
  if (d.months.length <= 1 || i < 0 || i >= d.months.length) return d
  const m = d.leap.month
  const month = m > i ? m - 1 : Math.min(m, d.months.length - 2)
  return { ...d, months: without(d.months, i), leap: { ...d.leap, month } }
}

/** Swaps with the neighbour; the leap month follows its month. Returns `d` itself when out of range. */
export function moveMonth(d: CalendarDraft, i: number, delta: number): CalendarDraft {
  const months = moved(d.months, i, delta)
  if (!months) return d
  const m = d.leap.month
  const month = m === i ? i + delta : m === i + delta ? i : m
  return { ...d, months, leap: { ...d.leap, month } }
}

export function addWeekday(d: CalendarDraft): CalendarDraft {
  return { ...d, weekdays: [...d.weekdays, `Day ${d.weekdays.length + 1}`] }
}
export function removeWeekday(d: CalendarDraft, i: number): CalendarDraft {
  return { ...d, weekdays: without(d.weekdays, i) }
}
export function moveWeekday(d: CalendarDraft, i: number, delta: number): CalendarDraft {
  const weekdays = moved(d.weekdays, i, delta)
  return weekdays ? { ...d, weekdays } : d
}

export function addEra(d: CalendarDraft): CalendarDraft {
  const last = d.eras[d.eras.length - 1]
  return {
    ...d,
    eras: [
      ...d.eras,
      { name: `Era ${d.eras.length + 1}`, startYear: last ? last.startYear + 1000 : 1 },
    ],
  }
}
export function removeEra(d: CalendarDraft, i: number): CalendarDraft {
  return { ...d, eras: without(d.eras, i) }
}
