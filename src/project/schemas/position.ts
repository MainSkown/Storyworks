import { z } from 'zod'
import { calendarDateSchema } from '../../calendar/schema'

/** A point in story time: a timeline node or a calendar date. Same shape as the order helper's `Position`. */
export const positionSchema = z.union([
  z.strictObject({ node: z.strictObject({ timelineId: z.string(), nodeId: z.string() }) }),
  z.strictObject({ date: calendarDateSchema }),
])

export type PositionData = z.infer<typeof positionSchema>
