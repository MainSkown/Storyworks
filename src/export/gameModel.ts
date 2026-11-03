import { z } from 'zod'
import { conditionSchema, setSchema } from '../project/schemas/condition'
import { itemLinkSchema } from '../project/schemas/conversation'
import { MECHANIC_LINK_KINDS, MECHANIC_STATUSES } from '../project/schemas/mechanic'
import { variableSchema } from '../project/schemas/variables'

export const GAME_FORMAT = 'storyworks-game'
export const GAME_VERSION = 1

const id = z.string().min(1)

const routeSchema = z.strictObject({ timelineId: id, branchId: id, name: z.string().nullable() })

/** Speaker name is the codex name (read live) or the typed one; null for none or a deleted entry. */
const lineSchema = z.strictObject({
  lineId: id,
  kind: z.enum(['speech', 'text']),
  speakerId: z.string().nullable(),
  speakerName: z.string().nullable(),
  text: z.string(),
})

const nodeBase = { id, condition: conditionSchema.optional(), sets: z.array(setSchema) }

const optionSchema = z.strictObject({
  id,
  text: z.string(),
  target: z.string().nullable(),
  link: itemLinkSchema.optional(),
  condition: conditionSchema.optional(),
  sets: z.array(setSchema),
})

const nodeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...nodeBase, type: z.literal('lines'), lines: z.array(lineSchema), next: z.string().nullable() }),
  z.strictObject({ ...nodeBase, type: z.literal('choice'), options: z.array(optionSchema) }),
  z.strictObject({ ...nodeBase, type: z.literal('jump'), target: z.string().nullable(), link: itemLinkSchema.optional() }),
  z.strictObject({ ...nodeBase, type: z.literal('end') }),
])

const edgeSchema = z.strictObject({ id, from: id, to: id, label: z.string().optional() })

const itemBase = { id, title: z.string(), parentId: z.string().nullable(), routes: z.array(routeSchema) }

const itemSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...itemBase, type: z.literal('folder') }),
  z.strictObject({ ...itemBase, type: z.literal('script'), lines: z.array(lineSchema) }),
  z.strictObject({
    ...itemBase,
    type: z.literal('conversation'),
    startNodeId: z.string().nullable(),
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
  }),
])

const boxSchema = z.discriminatedUnion('kind', [
  z.strictObject({ id, kind: z.literal('item'), itemId: id }),
  z.strictObject({ id, kind: z.literal('beat'), text: z.string() }),
])

/** Manual arrows carry their condition; derived ones come from conversation links and name their sources. */
const arrowSchema = z.strictObject({
  id,
  from: id,
  to: id,
  derived: z.boolean(),
  condition: conditionSchema.optional(),
  sources: z.array(z.strictObject({ nodeId: id, optionId: z.string().optional() })).optional(),
})

const mechanicSchema = z.strictObject({
  id,
  title: z.string(),
  summary: z.string(),
  categoryId: z.string(),
  status: z.enum(MECHANIC_STATUSES),
  tags: z.array(z.string()),
  description: z.string(),
  parameters: z.array(z.strictObject({ id, name: z.string(), value: z.string() })),
  /** `name` is null when the target no longer exists. */
  links: z.array(z.strictObject({ kind: z.enum(MECHANIC_LINK_KINDS), id, name: z.string().nullable() })),
})

export const gameDocSchema = z.strictObject({
  format: z.literal(GAME_FORMAT),
  version: z.literal(GAME_VERSION),
  project: z.strictObject({ title: z.string(), author: z.string(), language: z.string() }),
  variables: z.array(variableSchema),
  items: z.array(itemSchema),
  storyMap: z.strictObject({ boxes: z.array(boxSchema), arrows: z.array(arrowSchema), starts: z.array(id) }),
  routes: z.array(routeSchema.extend({ name: z.string(), timelineName: z.string() })),
  gameDocument: z.strictObject({
    overview: z.string(),
    categories: z.array(z.strictObject({ id, name: z.string(), color: z.string() })),
    mechanics: z.array(mechanicSchema),
    glossary: z.array(z.strictObject({ id, term: z.string(), definition: z.string() })),
  }),
})

/** Format-neutral game data, built once and handed to the JSON and CSV writers. */
export type GameDoc = z.infer<typeof gameDocSchema>
export type GameItem = GameDoc['items'][number]
export type GameLine = z.infer<typeof lineSchema>
export type GameNode = z.infer<typeof nodeSchema>
