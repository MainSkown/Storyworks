import { z } from 'zod'

export const RULE_VERSION = 1

const doc = () => z.record(z.string(), z.unknown()).default({ type: 'doc', content: [] })

export const ruleSchema = z.strictObject({
  version: z.literal(RULE_VERSION),
  id: z.string(),
  title: z.string(),
  categoryId: z.string(),
  description: doc(),
  tags: z.array(z.string()).default([]),
  exceptions: doc(),
})

export type Rule = z.infer<typeof ruleSchema>
