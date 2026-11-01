import { z } from 'zod'

export const CALENDAR_VERSION = 1

const name = z.string().refine((s) => s.trim() !== '', 'Name must not be blank')
const posInt = z.number().int().min(1)

export const monthSchema = z.strictObject({ name, days: posInt })

/** One optional leap rule: `extraDays` added to `month` in years divisible by `every`, minus the exception. */
export const leapRuleSchema = z.strictObject({
  month: z.number().int().min(0),
  extraDays: posInt,
  every: posInt,
  exceptEvery: posInt.optional(),
  unlessEvery: posInt.optional(),
})

export const eraSchema = z.strictObject({ name, startYear: z.number().int() })

/** Stored on nodes. `year` is absolute and continuous (may be <= 0); `month` is a 0-based index. Not checked against a calendar here. */
export const calendarDateSchema = z.strictObject({
  year: z.number().int(),
  month: z.number().int(),
  day: z.number().int(),
})

const key = (s: string) => s.trim().toLowerCase()
const hasDuplicates = (names: string[]) => new Set(names.map(key)).size !== names.length

export const calendarSchema = z
  .strictObject({
    version: z.literal(CALENDAR_VERSION),
    id: z.string(),
    months: z.array(monthSchema).min(1),
    weekdays: z.array(name).default([]),
    eras: z.array(eraSchema).default([]),
    epochLabel: z.string().optional(),
    leap: leapRuleSchema.nullable().default(null),
  })
  .superRefine((c, ctx) => {
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message })
    if (hasDuplicates(c.months.map((m) => m.name))) fail(['months'], 'Month names must be unique')
    if (hasDuplicates(c.weekdays)) fail(['weekdays'], 'Weekday names must be unique')
    if (hasDuplicates(c.eras.map((e) => e.name))) fail(['eras'], 'Era names must be unique')
    if (!c.leap) return
    if (c.leap.month >= c.months.length) fail(['leap', 'month'], 'Leap month does not exist')
    if (c.leap.unlessEvery !== undefined && c.leap.exceptEvery === undefined)
      fail(['leap', 'unlessEvery'], 'unlessEvery needs exceptEvery')
  })

export type Calendar = z.infer<typeof calendarSchema>
export type CalendarDate = z.infer<typeof calendarDateSchema>
export type LeapRule = z.infer<typeof leapRuleSchema>
