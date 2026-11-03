import { z } from 'zod'

/** A route is one timeline branch; ids are per timeline, so both are needed. */
export const routeRefSchema = z.strictObject({
  timelineId: z.string().min(1),
  branchId: z.string().min(1),
})
export type RouteRef = z.infer<typeof routeRefSchema>
