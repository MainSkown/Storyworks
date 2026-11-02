import { loadList } from './rules'
import { knowledgeItemSchema, type KnowledgeItem, type Learning } from './schemas/knowledge'
import type { OpenProject } from './types'

export const knowledgePath = (id: string) => `knowledge/${id}.json`

export const loadKnowledge = (project: OpenProject) =>
  loadList(project, project.manifest.knowledge, knowledgeItemSchema)

// ---- validation ----

export type LearningCheck =
  { ok: true } | { ok: false; reason: 'unknown-entry' | 'forgotten-before-learned' }

/** True when `forgottenAt` is definitely before or equal to `at` (the UI passes the order helper). Unknown order = false. */
export type ForgottenBeforeLearned = (at: Learning['at'], forgottenAt: Learning['at']) => boolean

/** The learner must be a live entry; forgetting must not be definitely before (or at) the learning. */
export function validateLearning(
  learning: Pick<Learning, 'entryId' | 'at' | 'forgottenAt'>,
  live: { entryIds: ReadonlySet<string> },
  isForgottenBeforeLearned?: ForgottenBeforeLearned,
): LearningCheck {
  if (!live.entryIds.has(learning.entryId)) return { ok: false, reason: 'unknown-entry' }
  if (learning.forgottenAt && isForgottenBeforeLearned?.(learning.at, learning.forgottenAt))
    return { ok: false, reason: 'forgotten-before-learned' }
  return { ok: true }
}

// ---- broken ----

type Items = readonly KnowledgeItem[]

/** Learnings whose learner entry is not live (trashed or missing). */
export function brokenLearnings(
  items: Items,
  liveEntryIds: ReadonlySet<string>,
): { itemId: string; learningId: string }[] {
  return items.flatMap((k) =>
    k.learnings
      .filter((l) => !liveEntryIds.has(l.entryId))
      .map((l) => ({ itemId: k.id, learningId: l.id })),
  )
}

/** Items whose `about` target (rule or entry) is not live. */
export function brokenAbout(
  items: Items,
  liveEntryIds: ReadonlySet<string>,
  liveRuleIds: ReadonlySet<string>,
): string[] {
  return items
    .filter(
      (k) => k.about && !(k.about.type === 'rule' ? liveRuleIds : liveEntryIds).has(k.about.id),
    )
    .map((k) => k.id)
}

// ---- lookups ----

export interface LearningRow {
  item: KnowledgeItem
  learning: Learning
}

/** What this entry learns, in item then learning order. */
export const learningsOfEntry = (items: Items, entryId: string): LearningRow[] =>
  items.flatMap((item) =>
    item.learnings.filter((l) => l.entryId === entryId).map((learning) => ({ item, learning })),
  )

export const learningsOfItem = (item: KnowledgeItem): Learning[] => item.learnings

const isNode = (p: Learning['at'] | null, timelineId: string, nodeId: string) =>
  !!p && 'node' in p && p.node.timelineId === timelineId && p.node.nodeId === nodeId

/** Learn and forget events placed on a timeline node. */
export function learningsAtNode(
  items: Items,
  timelineId: string,
  nodeId: string,
): (LearningRow & { kind: 'learns' | 'forgets' })[] {
  return items.flatMap((item) =>
    item.learnings.flatMap((learning) => [
      ...(isNode(learning.at, timelineId, nodeId)
        ? [{ item, learning, kind: 'learns' as const }]
        : []),
      ...(isNode(learning.forgottenAt, timelineId, nodeId)
        ? [{ item, learning, kind: 'forgets' as const }]
        : []),
    ]),
  )
}

/** 0 hides the node marker. */
export const knowledgeEventCountAtNode = (items: Items, timelineId: string, nodeId: string) =>
  learningsAtNode(items, timelineId, nodeId).length
