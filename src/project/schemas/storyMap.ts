import { z } from 'zod'
import { conditionSchema } from './condition'

export const STORY_MAP_VERSION = 1
export const STORY_MAP_FILE = 'story-map.json'

const boxBase = {
  id: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  start: z.boolean().default(false),
}

/** An item box points at a Script or Conversation by its tree id; a beat is a free note. */
export const storyBoxSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...boxBase, kind: z.literal('item'), itemId: z.string().min(1) }),
  z.strictObject({ ...boxBase, kind: z.literal('beat'), text: z.string() }),
])

/** A manual arrow; arrows derived from conversation links are never stored. */
export const storyArrowSchema = z.strictObject({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  condition: conditionSchema.optional(),
})

export const storyMapSchema = z
  .strictObject({
    version: z.literal(STORY_MAP_VERSION),
    boxes: z.array(storyBoxSchema).default([]),
    arrows: z.array(storyArrowSchema).default([]),
  })
  .superRefine((m, ctx) => {
    const bad = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message })
    const boxIds = new Set<string>()
    const itemIds = new Set<string>()
    m.boxes.forEach((b, i) => {
      if (boxIds.has(b.id)) bad(['boxes', i, 'id'], 'Duplicate box id')
      boxIds.add(b.id)
      if (b.kind !== 'item') return
      if (itemIds.has(b.itemId)) bad(['boxes', i, 'itemId'], 'Item has two boxes')
      itemIds.add(b.itemId)
    })
    const arrowIds = new Set<string>()
    const pairs = new Set<string>()
    m.arrows.forEach((a, i) => {
      if (arrowIds.has(a.id)) bad(['arrows', i, 'id'], 'Duplicate arrow id')
      arrowIds.add(a.id)
      if (!boxIds.has(a.from)) bad(['arrows', i, 'from'], 'Arrow starts at a missing box')
      if (!boxIds.has(a.to)) bad(['arrows', i, 'to'], 'Arrow ends at a missing box')
      const pair = `${a.from}>${a.to}`
      if (pairs.has(pair)) bad(['arrows', i], 'Two arrows between the same boxes')
      pairs.add(pair)
    })
  })

export type StoryMap = z.infer<typeof storyMapSchema>
export type StoryBox = z.infer<typeof storyBoxSchema>
export type StoryArrow = z.infer<typeof storyArrowSchema>
