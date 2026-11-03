import { z } from 'zod'

export const GLOSSARY_VERSION = 1
export const GLOSSARY_FILE = 'game-doc/glossary.json'

export const glossaryEntrySchema = z.strictObject({
  id: z.string().min(1),
  term: z.string().refine((t) => t.trim() !== '', 'Empty term'),
  definition: z.string(),
})

export const glossarySchema = z
  .strictObject({
    version: z.literal(GLOSSARY_VERSION),
    entries: z.array(glossaryEntrySchema).default([]),
  })
  .superRefine((g, ctx) => {
    const ids = new Set<string>()
    g.entries.forEach((e, i) => {
      if (ids.has(e.id)) ctx.addIssue({ code: 'custom', path: ['entries', i, 'id'], message: 'Duplicate id' })
      ids.add(e.id)
    })
  })

export type Glossary = z.infer<typeof glossarySchema>
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>
