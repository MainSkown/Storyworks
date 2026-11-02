import { z } from 'zod'
import { positionSchema } from './position'

export const CODEX_ENTRY_VERSION = 2

const doc = () => z.record(z.string(), z.unknown()).default({ type: 'doc', content: [] })

/** Only a project-relative path inside assets/ (no absolute paths, no `..`), so moved projects keep their images. */
export const isAssetPath = (p: string) =>
  p.startsWith('assets/') && p.length > 'assets/'.length && !p.split('/').includes('..') && !p.includes('\\')

export const aliasKey = (a: string) => a.trim().toLowerCase()

export const entryStateSchema = z.strictObject({
  id: z.string(),
  kindId: z.string(),
  /** Free text, or a codex entry id when the kind's value type is 'entry'. */
  value: z.string(),
  from: positionSchema,
  until: positionSchema.nullable().default(null),
  final: z.boolean().default(false),
})

export const codexEntrySchema = z
  .strictObject({
    version: z.literal(CODEX_ENTRY_VERSION),
    id: z.string(),
    typeId: z.string(),
    name: z.string(),
    aliases: z.array(z.string()).default([]),
    image: z.string().refine(isAssetPath, 'Image must be a path inside assets/').nullable().default(null),
    notes: doc(),
    tags: z.array(z.string()).default([]),
    ruleIds: z.array(z.string()).default([]),
    appendixText: z.string().default(''),
    includeInAppendices: z.boolean().default(false),
    states: z.array(entryStateSchema).default([]),
  })
  .superRefine((e, ctx) => {
    const keys = e.aliases.map(aliasKey)
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', path: ['aliases'], message: 'Duplicate alias' })
    if (new Set(e.states.map((s) => s.id)).size !== e.states.length)
      ctx.addIssue({ code: 'custom', path: ['states'], message: 'Duplicate state id' })
  })

export type CodexEntry = z.infer<typeof codexEntrySchema>
export type EntryState = z.infer<typeof entryStateSchema>
