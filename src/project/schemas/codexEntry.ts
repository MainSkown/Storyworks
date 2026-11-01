import { z } from 'zod'

export const CODEX_ENTRY_VERSION = 1

const doc = () => z.record(z.string(), z.unknown()).default({ type: 'doc', content: [] })

/** Only a project-relative path inside assets/ (no absolute paths, no `..`), so moved projects keep their images. */
export const isAssetPath = (p: string) =>
  p.startsWith('assets/') && p.length > 'assets/'.length && !p.split('/').includes('..') && !p.includes('\\')

export const aliasKey = (a: string) => a.trim().toLowerCase()

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
  })
  .superRefine((e, ctx) => {
    const keys = e.aliases.map(aliasKey)
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', path: ['aliases'], message: 'Duplicate alias' })
  })

export type CodexEntry = z.infer<typeof codexEntrySchema>
