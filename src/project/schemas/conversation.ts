import { z } from 'zod'
import { sceneStatusSchema } from './scene'

export const CONVERSATION_VERSION = 1

/** S3 stub: no nodes yet. S4 adds the graph and bumps the version with a migration. */
export const conversationSchema = z.strictObject({
  version: z.literal(CONVERSATION_VERSION),
  id: z.string(),
  title: z.string(),
  status: sceneStatusSchema.default('draft'),
  synopsis: z.string().default(''),
  nodes: z.array(z.never()).default([]),
})

export type Conversation = z.infer<typeof conversationSchema>
