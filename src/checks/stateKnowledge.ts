import { knowledgeUseIssues, type LearningLike, type UseReason } from '../knowledge/logic'
import { appearsAfterFinal, overlappingStates, type KindLike, type StateLike } from '../project/stateChecks'
import type { OrderContext, Position } from '../timeline/order'
import { makeFinding, type Finding } from './types'

/** A state with its owner entry. */
export interface CheckState extends StateLike {
  entryId: string
}

export interface CheckKind extends KindLike {
  name: string
}

/**
 * A manuscript passage linked to an entry (and, for knowledge, an item). `positions` are the
 * timeline positions of the block (its event links); empty means the block is not placed and is
 * skipped. `label` is the resolved passage text for the scene location.
 */
export interface PassageUse {
  blockId: string
  sceneId: string
  entryId: string
  positions: Position[]
  label: string
}

export type KnowledgeUse = PassageUse & { itemId: string }

export interface KnowledgeItemInput {
  id: string
  name: string
  learnings: LearningLike[]
}

const entryLoc = (id: string, label: string) => ({ kind: 'entry' as const, id, label })
const sceneLoc = (u: PassageUse) => ({
  kind: 'scene' as const,
  id: u.sceneId,
  blockId: u.blockId,
  label: u.label,
})

/** Overlapping states of one exclusive kind on one entry. Half-open periods; unknown order never flagged. */
export function stateOverlaps(
  input: {
    states: CheckState[]
    kinds: CheckKind[]
    entryLabel: (entryId: string) => string
    valueLabel: (state: CheckState) => string
  },
  ctx: OrderContext,
): Finding[] {
  const { states, kinds, entryLabel, valueLabel } = input
  const kindName = new Map(kinds.map((k) => [k.id, k.name]))
  const byEntry = new Map<string, CheckState[]>()
  for (const s of states) {
    const list = byEntry.get(s.entryId)
    if (list) list.push(s)
    else byEntry.set(s.entryId, [s])
  }
  const out = new Map<string, Finding>()
  for (const [entryId, own] of byEntry) {
    for (const { kindId, a, b } of overlappingStates(own, kinds, ctx)) {
      const kind = kindName.get(kindId) ?? kindId
      const va = valueLabel(a)
      const vb = valueLabel(b)
      const f = makeFinding(
        'state-overlap',
        [a.id, b.id],
        `${entryLabel(entryId)} has overlapping "${kind}" states: "${va}" and "${vb}".`,
        [entryLoc(entryId, `${kind}: ${va} / ${vb}`)],
        true,
        { params: { entry: entryLabel(entryId), kind, a: va, b: vb } },
      )
      if (!out.has(f.id)) out.set(f.id, f)
    }
  }
  return [...out.values()]
}

/**
 * Passages linked to an entry that sit definitely after the start of one of its final states.
 * A block with several positions is flagged only when every position is after the final state.
 */
export function appearancesAfterFinal(
  input: {
    states: CheckState[]
    uses: PassageUse[]
    entryLabel: (entryId: string) => string
    valueLabel: (state: CheckState) => string
  },
  ctx: OrderContext,
): Finding[] {
  const { states, uses, entryLabel, valueLabel } = input
  const out = new Map<string, Finding>()
  for (const u of uses) {
    if (u.positions.length === 0) continue
    const own = states.filter((s) => s.entryId === u.entryId)
    const hits = u.positions.map(
      (position, i) => appearsAfterFinal(own, [{ id: String(i), position }], ctx)[0]?.state,
    )
    const state = hits[0]
    if (!state || hits.some((h) => !h)) continue
    const f = makeFinding(
      'appearance-after-final',
      [u.blockId, state.id],
      `${entryLabel(u.entryId)} appears here after its final state "${valueLabel(state)}" has begun.`,
      [sceneLoc(u), entryLoc(u.entryId, entryLabel(u.entryId))],
      false,
      { params: { entry: entryLabel(u.entryId), state: valueLabel(state) } },
    )
    if (!out.has(f.id)) out.set(f.id, f)
  }
  return [...out.values()]
}

const REASON_TEXT: Record<UseReason, (entry: string, item: string) => string> = {
  'before-learning': (e, k) => `${e} uses "${k}" here before learning it.`,
  'never-learned': (e, k) => `${e} uses "${k}" here but never learns it.`,
  'after-forgetting': (e, k) => `${e} uses "${k}" here after forgetting it.`,
}

/**
 * Knowledge use links whose passage is before the entry learns the item, after it forgot it, or
 * where it never learns it. A block with several positions is flagged only when every position is a
 * problem (reason of the first). Uses of a missing item are skipped.
 */
export function knowledgeTiming(
  input: {
    items: KnowledgeItemInput[]
    uses: KnowledgeUse[]
    entryLabel: (entryId: string) => string
  },
  ctx: OrderContext,
): Finding[] {
  const items = new Map(input.items.map((k) => [k.id, k]))
  const out = new Map<string, Finding>()
  for (const u of input.uses) {
    const item = items.get(u.itemId)
    if (!item || u.positions.length === 0) continue
    const learnings = item.learnings.filter((l) => l.entryId === u.entryId)
    const issues = knowledgeUseIssues(
      learnings,
      u.positions.map((position, i) => ({ id: String(i), position })),
      ctx,
    )
    if (issues.length !== u.positions.length) continue
    const entry = input.entryLabel(u.entryId)
    const f = makeFinding(
      'knowledge-timing',
      [u.blockId, u.itemId, u.entryId],
      REASON_TEXT[issues[0].reason](entry, item.name),
      [sceneLoc(u), entryLoc(u.entryId, entry)],
      false,
      { variant: issues[0].reason, params: { entry, item: item.name } },
    )
    if (!out.has(f.id)) out.set(f.id, f)
  }
  return [...out.values()]
}
