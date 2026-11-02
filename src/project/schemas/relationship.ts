import { z } from 'zod'

export const RELATIONSHIP_VERSION = 1

const doc = () => z.record(z.string(), z.unknown()).default({ type: 'doc', content: [] })

export const relationshipSchema = z
  .strictObject({
    version: z.literal(RELATIONSHIP_VERSION),
    id: z.string(),
    fromId: z.string(),
    toId: z.string(),
    typeId: z.string(),
    note: doc(),
    nodeRef: z.strictObject({ timelineId: z.string(), nodeId: z.string() }).nullable().default(null),
  })
  .superRefine((r, ctx) => {
    if (r.fromId === r.toId)
      ctx.addIssue({ code: 'custom', path: ['toId'], message: 'A relationship needs two different entries' })
  })

export type Relationship = z.infer<typeof relationshipSchema>
