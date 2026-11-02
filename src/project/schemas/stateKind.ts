import { z } from 'zod'

export const STATE_KIND_VERSION = 1

export const stateKindSchema = z.strictObject({
  version: z.literal(STATE_KIND_VERSION),
  id: z.string(),
  name: z.string(),
  /** 'entry' values are codex entry ids; 'text' values are free text. */
  valueType: z.enum(['text', 'entry']),
  /** An exclusive kind holds one value at a time (overlap is a finding in M7). */
  exclusive: z.boolean(),
})

export type StateKind = z.infer<typeof stateKindSchema>
