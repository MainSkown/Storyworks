import { z } from 'zod'

export const SCENE_VERSION = 3

export const sceneStatusSchema = z.enum(['idea', 'draft', 'revising', 'final'])

export const commentSchema = z.strictObject({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
  resolved: z.boolean(),
})

export const todoSchema = z.strictObject({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
})

const linkRefSchema = z.strictObject({
  item: z.string(),
  block: z.string().optional(),
  /** Knowledge use links: the entry of the (item, entry) pair. */
  entry: z.string().optional(),
})

export const linkSchema = z.strictObject({
  id: z.string(),
  from: linkRefSchema,
  to: linkRefSchema,
  kind: z.string(),
})

/** Collects every `attrs.id` in a ProseMirror-style tree (nodes nest through `content`). */
export function blockIds(node: unknown, out: string[] = []): string[] {
  if (typeof node !== 'object' || node === null) return out
  const n = node as { attrs?: { id?: unknown }; content?: unknown }
  if (typeof n.attrs?.id === 'string') out.push(n.attrs.id)
  if (Array.isArray(n.content)) for (const child of n.content) blockIds(child, out)
  return out
}

export const sceneSchema = z
  .strictObject({
    version: z.literal(SCENE_VERSION),
    id: z.string(),
    title: z.string(),
    status: sceneStatusSchema.default('draft'),
    synopsis: z.string().default(''),
    povId: z.string().optional(),
    wordCount: z.number().int().min(0).default(0),
    content: z.record(z.string(), z.unknown()),
    todos: z.array(todoSchema).default([]),
    comments: z.array(commentSchema).default([]),
    links: z.array(linkSchema).default([]),
  })
  .refine((s) => new Set(blockIds(s.content)).size === blockIds(s.content).length, {
    path: ['content'],
    message: 'Duplicate block id',
  })

export type Scene = z.infer<typeof sceneSchema>
