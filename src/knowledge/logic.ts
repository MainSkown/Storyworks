import { compare, type OrderContext, type Position } from '../timeline/order'

/** The part of a learning event the logic reads. */
export interface LearningLike {
  id: string
  entryId: string
  at: Position
  forgottenAt: Position | null
}

export interface ItemLike {
  id: string
  learnings: LearningLike[]
}

export type Knows = 'known' | 'not-yet' | 'forgotten' | 'unknown'
export type CellState = Knows | 'none'

/**
 * Does the holder of `learnings` know the item as of `position`? Learned at the position counts
 * as known; forgotten at the position counts as forgotten. Unknown order is never guessed.
 */
export function knowsAsOf(learnings: LearningLike[], position: Position, ctx: OrderContext): Knows {
  let unknown = false
  let forgotten = false
  for (const l of learnings) {
    const o = compare(position, l.at, ctx)
    if (o === 'before') continue
    if (o === 'unknown') {
      unknown = true
      continue
    }
    if (!l.forgottenAt) return 'known'
    const f = compare(position, l.forgottenAt, ctx)
    if (f === 'before') return 'known'
    if (f === 'unknown') unknown = true
    else forgotten = true
  }
  return unknown ? 'unknown' : forgotten ? 'forgotten' : 'not-yet'
}

/** One row per distinct learner, in first-learning order. */
export function whoKnowsAsOf(
  item: ItemLike,
  position: Position,
  ctx: OrderContext,
): { entryId: string; state: Knows }[] {
  const byEntry = new Map<string, LearningLike[]>()
  for (const l of item.learnings) {
    const list = byEntry.get(l.entryId)
    if (list) list.push(l)
    else byEntry.set(l.entryId, [l])
  }
  return [...byEntry].map(([entryId, ls]) => ({ entryId, state: knowsAsOf(ls, position, ctx) }))
}

export interface MatrixCell {
  itemId: string
  learnings: LearningLike[]
  state: CellState
}

/** Rows follow `entryIds`, cells follow `items`. With `asOf` null: any learning means known. */
export function knowledgeMatrix(
  entryIds: string[],
  items: ItemLike[],
  asOf: Position | null,
  ctx: OrderContext,
): { entryId: string; cells: MatrixCell[] }[] {
  return entryIds.map((entryId) => ({
    entryId,
    cells: items.map((item) => {
      const learnings = item.learnings.filter((l) => l.entryId === entryId)
      const state: CellState =
        learnings.length === 0 ? 'none' : asOf ? knowsAsOf(learnings, asOf, ctx) : 'known'
      return { itemId: item.id, learnings, state }
    }),
  }))
}

/**
 * Blocks that use an item for an entry before it was learned. `learnings` are that entry's for
 * that item. No learning at all: every block. Otherwise a block is flagged only when it is
 * definitely before every learning (equal, unknown or after: not flagged).
 */
export function usedBeforeLearned(
  learnings: LearningLike[],
  blockPositions: { id: string; position: Position }[],
  ctx: OrderContext,
): { blockId: string; reason: 'before-learning' | 'never-learned' }[] {
  const out: { blockId: string; reason: 'before-learning' | 'never-learned' }[] = []
  for (const b of blockPositions) {
    if (learnings.length === 0) out.push({ blockId: b.id, reason: 'never-learned' })
    else if (learnings.every((l) => compare(b.position, l.at, ctx) === 'before'))
      out.push({ blockId: b.id, reason: 'before-learning' })
  }
  return out
}

export type UseReason = 'before-learning' | 'never-learned' | 'after-forgetting'

/**
 * Blocks that use an item for an entry definitely after it was forgotten. A block is flagged only
 * when at least one learning covers it (the block is at or after `at`), every covering learning has
 * a `forgottenAt` the block is strictly after, and no learning has unknown order to the block.
 * A later re-learning that covers the block, or any unknown order, protects it.
 */
export function usedAfterForgetting(
  learnings: LearningLike[],
  blockPositions: { id: string; position: Position }[],
  ctx: OrderContext,
): { blockId: string; reason: 'after-forgetting' }[] {
  const out: { blockId: string; reason: 'after-forgetting' }[] = []
  for (const b of blockPositions) {
    let covering = 0
    let protectedUse = false
    for (const l of learnings) {
      const o = compare(b.position, l.at, ctx)
      if (o === 'before') continue
      if (o === 'unknown') {
        protectedUse = true
        break
      }
      if (!l.forgottenAt || compare(b.position, l.forgottenAt, ctx) !== 'after') {
        protectedUse = true
        break
      }
      covering++
    }
    if (!protectedUse && covering > 0) out.push({ blockId: b.id, reason: 'after-forgetting' })
  }
  return out
}

/** Both knowledge-use problems in block order; a block gets at most one reason. */
export function knowledgeUseIssues(
  learnings: LearningLike[],
  blockPositions: { id: string; position: Position }[],
  ctx: OrderContext,
): { blockId: string; reason: UseReason }[] {
  const before = new Map<string, UseReason>(
    usedBeforeLearned(learnings, blockPositions, ctx).map((i) => [i.blockId, i.reason]),
  )
  const after = new Set(usedAfterForgetting(learnings, blockPositions, ctx).map((i) => i.blockId))
  const out: { blockId: string; reason: UseReason }[] = []
  for (const b of blockPositions) {
    const reason = before.get(b.id) ?? (after.has(b.id) ? 'after-forgetting' : null)
    if (reason) out.push({ blockId: b.id, reason })
  }
  return out
}
