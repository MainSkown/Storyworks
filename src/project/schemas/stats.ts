import { z } from 'zod'

export const STATS_VERSION = 1

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Net words per local day, and the writing sessions behind them (`stats.json`). */
export const statsSchema = z.strictObject({
  version: z.literal(STATS_VERSION),
  days: z.array(z.strictObject({ date, net: z.number().int() })),
  sessions: z.array(
    z.strictObject({ id: z.string(), start: z.string(), end: z.string(), net: z.number().int() }),
  ),
})

export type Stats = z.infer<typeof statsSchema>

export const emptyStats = (): Stats => ({ version: STATS_VERSION, days: [], sessions: [] })
