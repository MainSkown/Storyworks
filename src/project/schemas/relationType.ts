import { z } from 'zod'

export const RELATION_TYPE_VERSION = 1

export const relationTypeSchema = z.strictObject({
  version: z.literal(RELATION_TYPE_VERSION),
  id: z.string(),
  name: z.string(),
  /** Shown on the other entry's page; empty = same label on both sides. */
  reverseLabel: z.string().default(''),
  color: z.string(),
})

export type RelationType = z.infer<typeof relationTypeSchema>
