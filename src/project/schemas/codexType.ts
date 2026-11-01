import { z } from 'zod'

export const CODEX_TYPE_VERSION = 1

export const codexTypeSchema = z.strictObject({
  version: z.literal(CODEX_TYPE_VERSION),
  id: z.string(),
  name: z.string(),
  color: z.string(),
  icon: z.string(),
})

export type CodexType = z.infer<typeof codexTypeSchema>
