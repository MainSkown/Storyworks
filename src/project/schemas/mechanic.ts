import { z } from 'zod'

export const MECHANIC_VERSION = 1

export const MECHANIC_STATUSES = ['idea', 'designed', 'implemented', 'cut'] as const
export type MechanicStatus = (typeof MECHANIC_STATUSES)[number]

/** item = tree node (Conversation or Script), beat = story-map box, entry = codex entry. */
export const MECHANIC_LINK_KINDS = ['variable', 'item', 'beat', 'entry', 'mechanic'] as const
export type MechanicLinkKind = (typeof MECHANIC_LINK_KINDS)[number]

const doc = () => z.record(z.string(), z.unknown()).default({ type: 'doc', content: [] })

export const mechanicParameterSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  value: z.string(),
})

export const mechanicLinkSchema = z.strictObject({
  kind: z.enum(MECHANIC_LINK_KINDS),
  id: z.string().min(1),
})

export const mechanicSchema = z
  .strictObject({
    version: z.literal(MECHANIC_VERSION),
    id: z.string(),
    title: z.string(),
    summary: z.string().default(''),
    categoryId: z.string(),
    status: z.enum(MECHANIC_STATUSES).default('idea'),
    tags: z.array(z.string()).default([]),
    description: doc(),
    parameters: z.array(mechanicParameterSchema).default([]),
    links: z.array(mechanicLinkSchema).default([]),
  })
  .superRefine((m, ctx) => {
    const bad = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message })
    const params = new Set<string>()
    m.parameters.forEach((p, i) => {
      if (params.has(p.id)) bad(['parameters', i, 'id'], 'Duplicate parameter id')
      params.add(p.id)
    })
    const links = new Set<string>()
    m.links.forEach((l, i) => {
      const key = `${l.kind}:${l.id}`
      if (links.has(key)) bad(['links', i], 'Duplicate link')
      links.add(key)
    })
  })

export type Mechanic = z.infer<typeof mechanicSchema>
export type MechanicLink = z.infer<typeof mechanicLinkSchema>
export type MechanicParameter = z.infer<typeof mechanicParameterSchema>
