import { z } from 'zod'

export const GROUP_VERSION = 1

export const groupSchema = z
  .strictObject({
    version: z.literal(GROUP_VERSION),
    id: z.string(),
    name: z.string(),
    color: z.string(),
    memberIds: z.array(z.string()).default([]),
  })
  .superRefine((g, ctx) => {
    if (new Set(g.memberIds).size !== g.memberIds.length)
      ctx.addIssue({ code: 'custom', path: ['memberIds'], message: 'Duplicate member' })
  })

export type Group = z.infer<typeof groupSchema>
