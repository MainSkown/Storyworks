import { z } from 'zod'
import { positionSchema } from './position'

export const KNOWLEDGE_VERSION = 1

const doc = () => z.record(z.string(), z.unknown()).default({ type: 'doc', content: [] })

export const learningSchema = z.strictObject({
  id: z.string(),
  /** The codex entry that learns it. */
  entryId: z.string(),
  at: positionSchema,
  note: z.string().default(''),
  forgottenAt: positionSchema.nullable().default(null),
  /** The scene block where the reader is told. */
  revealedIn: z.strictObject({ sceneId: z.string(), blockId: z.string() }).nullable().default(null),
})

export const knowledgeItemSchema = z
  .strictObject({
    version: z.literal(KNOWLEDGE_VERSION),
    id: z.string(),
    title: z.string(),
    description: doc(),
    tags: z.array(z.string()).default([]),
    /** The rule or entry the knowledge is about. */
    about: z
      .strictObject({ type: z.enum(['rule', 'entry']), id: z.string() })
      .nullable()
      .default(null),
    learnings: z.array(learningSchema).default([]),
  })
  .superRefine((k, ctx) => {
    if (new Set(k.learnings.map((l) => l.id)).size !== k.learnings.length)
      ctx.addIssue({ code: 'custom', path: ['learnings'], message: 'Duplicate learning id' })
  })

export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>
export type Learning = z.infer<typeof learningSchema>
