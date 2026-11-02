import { z } from 'zod'

export const RELATION_LAYOUT_VERSION = 1

export const relationLayoutSchema = z.strictObject({
  version: z.literal(RELATION_LAYOUT_VERSION),
  /** Dragged graph positions by entry id. */
  positions: z.record(z.string(), z.strictObject({ x: z.number(), y: z.number() })).default({}),
})

export type RelationLayout = z.infer<typeof relationLayoutSchema>
