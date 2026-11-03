import { z } from 'zod'
import { gameContentProblem, LINE_TYPE } from '../../editor/game/validate'
import { conditionSchema, setSchema } from './condition'
import { blockIds, sceneStatusSchema } from './scene'

export const CONVERSATION_VERSION = 2

const nodeBase = {
  id: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  condition: conditionSchema.optional(),
  sets: z.array(setSchema).default([]),
}

export const conversationOptionSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string(),
  target: z.string().nullable(),
  condition: conditionSchema.optional(),
  sets: z.array(setSchema).default([]),
})

/** Targets may dangle: they are shown as broken, never repaired in the file. */
export const conversationNodeSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...nodeBase,
    type: z.literal('lines'),
    content: z.record(z.string(), z.unknown()),
    next: z.string().nullable(),
  }),
  z.strictObject({
    ...nodeBase,
    type: z.literal('choice'),
    options: z.array(conversationOptionSchema),
  }),
  z.strictObject({
    ...nodeBase,
    type: z.literal('jump'),
    target: z.strictObject({ nodeId: z.string() }).nullable(),
  }),
  z.strictObject({ ...nodeBase, type: z.literal('end') }),
])

const lineIdsOf = (content: Record<string, unknown>): string[] =>
  (Array.isArray(content.content) ? (content.content as unknown[]) : []).flatMap((c) => {
    const n = c as { type?: unknown; attrs?: { lineId?: unknown } } | null
    return n?.type === LINE_TYPE && typeof n.attrs?.lineId === 'string' ? [n.attrs.lineId] : []
  })

export const conversationSchema = z
  .strictObject({
    version: z.literal(CONVERSATION_VERSION),
    id: z.string(),
    title: z.string(),
    status: sceneStatusSchema.default('draft'),
    synopsis: z.string().default(''),
    startNodeId: z.string().nullable().default(null),
    nodes: z.array(conversationNodeSchema).default([]),
  })
  .superRefine((c, ctx) => {
    const nodeIds = new Set<string>()
    const optionIds = new Set<string>()
    const lineIds = new Set<string>()
    const blocks = new Set<string>()
    const bad = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message })
    c.nodes.forEach((n, i) => {
      if (nodeIds.has(n.id)) bad(['nodes', i, 'id'], 'Duplicate node id')
      nodeIds.add(n.id)
      if (n.type === 'choice')
        n.options.forEach((o, j) => {
          if (optionIds.has(o.id)) bad(['nodes', i, 'options', j, 'id'], 'Duplicate option id')
          optionIds.add(o.id)
        })
      if (n.type !== 'lines') return
      const problem = gameContentProblem(n.content)
      if (problem) bad(['nodes', i, 'content'], `Invalid script lines: ${problem}`)
      for (const lineId of lineIdsOf(n.content)) {
        if (lineIds.has(lineId)) bad(['nodes', i, 'content'], `Duplicate line id ${lineId}`)
        lineIds.add(lineId)
      }
      for (const id of blockIds(n.content)) {
        if (blocks.has(id)) bad(['nodes', i, 'content'], `Duplicate block id ${id}`)
        blocks.add(id)
      }
    })
  })

export type Conversation = z.infer<typeof conversationSchema>
export type ConversationNode = z.infer<typeof conversationNodeSchema>
export type ConversationOption = z.infer<typeof conversationOptionSchema>
