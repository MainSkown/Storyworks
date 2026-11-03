import { omitKey } from '../game/omit'
import { linksOf } from '../game/crossLinks'
import type { Condition } from '../project/schemas/condition'
import type { Conversation } from '../project/schemas/conversation'
import { STORY_MAP_VERSION, type StoryBox, type StoryMap } from '../project/schemas/storyMap'

export const BOX_W = 200
export const BOX_H = 72
const COLS = 4
const X_STEP = 280
const Y_STEP = 130

export const emptyStoryMap = (): StoryMap => ({ version: STORY_MAP_VERSION, boxes: [], arrows: [] })

const taken = (m: StoryMap, x: number, y: number) =>
  m.boxes.some((b) => Math.abs(b.x - x) < BOX_W && Math.abs(b.y - y) < BOX_H)

/** First free grid slot, row by row. */
function freeSlot(m: StoryMap): { x: number; y: number } {
  for (let i = 0; ; i++) {
    const x = (i % COLS) * X_STEP
    const y = Math.floor(i / COLS) * Y_STEP
    if (!taken(m, x, y)) return { x, y }
  }
}

const mapBox = (m: StoryMap, id: string, f: (b: StoryBox) => StoryBox): StoryMap =>
  m.boxes.some((b) => b.id === id) ? { ...m, boxes: m.boxes.map((b) => (b.id === id ? f(b) : b)) } : m

/** Adds a box for every item that has none; never removes boxes. `newId` makes each box id. */
export function syncItems(m: StoryMap, itemIds: readonly string[], newId: () => string): StoryMap {
  const have = new Set(m.boxes.flatMap((b) => (b.kind === 'item' ? [b.itemId] : [])))
  let out = m
  for (const itemId of itemIds) {
    if (have.has(itemId)) continue
    have.add(itemId)
    out = {
      ...out,
      boxes: [...out.boxes, { id: newId(), kind: 'item', itemId, start: false, ...freeSlot(out) }],
    }
  }
  return out
}

export function addBeat(
  m: StoryMap,
  b: { id: string; text: string; x: number; y: number },
): StoryMap {
  if (m.boxes.some((x) => x.id === b.id)) return m
  return { ...m, boxes: [...m.boxes, { kind: 'beat', start: false, ...b }] }
}

export const setBeatText = (m: StoryMap, id: string, text: string): StoryMap =>
  mapBox(m, id, (b) => (b.kind === 'beat' ? { ...b, text } : b))

export const moveBox = (m: StoryMap, id: string, x: number, y: number): StoryMap =>
  mapBox(m, id, (b) => ({ ...b, x, y }))

export const removeBox = (m: StoryMap, id: string): StoryMap => ({
  ...m,
  boxes: m.boxes.filter((b) => b.id !== id),
  arrows: m.arrows.filter((a) => a.from !== id && a.to !== id),
})

export const setStart = (m: StoryMap, id: string, start: boolean): StoryMap =>
  mapBox(m, id, (b) => ({ ...b, start }))

/** Marked starts; with none marked the first box stands in (`implicit`). */
export function startBoxes(m: StoryMap): { ids: string[]; implicit: boolean } {
  const marked = m.boxes.filter((b) => b.start).map((b) => b.id)
  if (marked.length > 0) return { ids: marked, implicit: false }
  return { ids: m.boxes.slice(0, 1).map((b) => b.id), implicit: true }
}

/** Returns `m` unchanged when refused: unknown box, reused arrow id or a second arrow for the pair. */
export function connect(m: StoryMap, id: string, from: string, to: string): StoryMap {
  const has = (b: string) => m.boxes.some((x) => x.id === b)
  if (!has(from) || !has(to)) return m
  if (m.arrows.some((a) => a.id === id || (a.from === from && a.to === to))) return m
  return { ...m, arrows: [...m.arrows, { id, from, to }] }
}

export const disconnect = (m: StoryMap, id: string): StoryMap =>
  m.arrows.some((a) => a.id === id) ? { ...m, arrows: m.arrows.filter((a) => a.id !== id) } : m

export function setArrowCondition(m: StoryMap, id: string, c: Condition | undefined): StoryMap {
  if (!m.arrows.some((a) => a.id === id)) return m
  return {
    ...m,
    arrows: m.arrows.map((a) => {
      if (a.id !== id) return a
      const rest = omitKey(a, 'condition')
      return c ? { ...rest, condition: c } : rest
    }),
  }
}

export interface DerivedSource {
  nodeId: string
  optionId?: string
  /** Option text; none for a jump node. */
  text: string | undefined
  condition?: Condition
}
export interface DerivedArrow {
  id: string
  from: string
  to: string
  sources: DerivedSource[]
}

/** Read-only arrows from conversations' cross-item links, one per (from box, to box). */
export function derivedArrows(
  m: StoryMap,
  conversations: readonly { id: string; conversation: Conversation }[],
): DerivedArrow[] {
  const boxOf = new Map(m.boxes.flatMap((b) => (b.kind === 'item' ? [[b.itemId, b.id] as const] : [])))
  const out = new Map<string, DerivedArrow>()
  for (const { id, conversation } of conversations) {
    const from = boxOf.get(id)
    if (!from) continue
    for (const src of linksOf(conversation)) {
      const to = boxOf.get(src.link.itemId)
      if (!to) continue
      const node = conversation.nodes.find((n) => n.id === src.nodeId)
      const option =
        node?.type === 'choice' ? node.options.find((o) => o.id === src.optionId) : undefined
      const source: DerivedSource = {
        nodeId: src.nodeId,
        ...(src.optionId === undefined ? {} : { optionId: src.optionId }),
        text: option?.text,
        ...(option?.condition ? { condition: option.condition } : {}),
      }
      const key = `auto:${from}>${to}`
      const arrow = out.get(key) ?? { id: key, from, to, sources: [] }
      arrow.sources.push(source)
      out.set(key, arrow)
    }
  }
  return [...out.values()]
}
