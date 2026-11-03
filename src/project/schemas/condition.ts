import { z } from 'zod'

const variableId = z.string().min(1)
const num = z.number().finite()

export const FLAG_OPS = ['isTrue', 'isFalse'] as const
export const NUMBER_OPS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'] as const
export const TEXT_OPS = ['eq', 'neq'] as const

/**
 * Operator and value shape only. Whether they fit the variable's type is checked at
 * evaluation, since a variable can be deleted or change type after the term was written.
 */
export const termSchema = z.discriminatedUnion('op', [
  z.strictObject({ variableId, op: z.enum(FLAG_OPS) }),
  z.strictObject({ variableId, op: z.enum(['eq', 'neq']), value: z.union([num, z.string()]) }),
  z.strictObject({ variableId, op: z.enum(['gt', 'lt', 'gte', 'lte']), value: num }),
])

export const conditionSchema = z.strictObject({
  mode: z.enum(['all', 'any']),
  terms: z.array(termSchema).min(1),
})

export const setSchema = z.discriminatedUnion('op', [
  z.strictObject({
    variableId,
    op: z.literal('set'),
    value: z.union([z.boolean(), num, z.string()]),
  }),
  z.strictObject({ variableId, op: z.literal('add'), value: num }),
  z.strictObject({ variableId, op: z.literal('toggle') }),
])

export type Term = z.infer<typeof termSchema>
export type Condition = z.infer<typeof conditionSchema>
export type SetOp = z.infer<typeof setSchema>
export type TermOp = Term['op']
