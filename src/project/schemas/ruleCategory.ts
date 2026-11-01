import { z } from 'zod'

export const RULE_CATEGORY_VERSION = 1

export const ruleCategorySchema = z.strictObject({
  version: z.literal(RULE_CATEGORY_VERSION),
  id: z.string(),
  name: z.string(),
  color: z.string(),
})

export type RuleCategory = z.infer<typeof ruleCategorySchema>
