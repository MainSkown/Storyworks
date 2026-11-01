import { z } from 'zod'
import { timelineEdgeSchema, timelineNodeSchema } from '../../timeline/schema'

export const TRASHED_NODE_VERSION = 1

/** A deleted timeline node, with the edges that touched it and where it sat. */
export const trashedNodeSchema = z.strictObject({
  version: z.literal(TRASHED_NODE_VERSION),
  id: z.string(),
  timelineId: z.string(),
  node: timelineNodeSchema,
  edges: z.array(timelineEdgeSchema),
  index: z.number().int().min(0),
})

export type TrashedNode = z.infer<typeof trashedNodeSchema>
