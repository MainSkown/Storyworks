import { z } from 'zod'

export const VARIABLES_VERSION = 1
export const VARIABLES_FILE = 'variables.json'

export const VARIABLE_TYPES = ['flag', 'number', 'text'] as const
export type VariableType = (typeof VARIABLE_TYPES)[number]

const base = {
  id: z.string().min(1),
  name: z.string().refine((n) => n.trim() !== '', 'Empty name'),
}

export const variableSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('flag'), default: z.boolean() }),
  z.strictObject({ ...base, type: z.literal('number'), default: z.number().finite() }),
  z.strictObject({ ...base, type: z.literal('text'), default: z.string() }),
])

export const variablesSchema = z
  .strictObject({
    version: z.literal(VARIABLES_VERSION),
    variables: z.array(variableSchema).default([]),
  })
  .superRefine((f, ctx) => {
    const ids = new Set<string>()
    const names = new Set<string>()
    f.variables.forEach((v, i) => {
      const key = v.name.trim().toLowerCase()
      if (ids.has(v.id))
        ctx.addIssue({ code: 'custom', path: ['variables', i, 'id'], message: 'Duplicate id' })
      if (names.has(key))
        ctx.addIssue({ code: 'custom', path: ['variables', i, 'name'], message: 'Duplicate name' })
      ids.add(v.id)
      names.add(key)
    })
  })

export type Variable = z.infer<typeof variableSchema>
export type VariablesFile = z.infer<typeof variablesSchema>

export const defaultFor = (type: VariableType): boolean | number | string =>
  type === 'flag' ? false : type === 'number' ? 0 : ''
