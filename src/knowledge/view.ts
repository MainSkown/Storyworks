import { sortChronologicalDetailed } from '../timeline/chrono'
import type { ChronicleExtra } from '../timeline/chronicle'
import { compare, type OrderContext, type Position } from '../timeline/order'
import { knowsAsOf, type Knows, type LearningLike } from './logic'

/** One learning of one entry, with the item it belongs to. */
export interface EntryLearningRow {
  item: { id: string; title: string }
  learning: LearningLike
}

/** Learnings in chronological order by `at`; `determined` is false when only a fallback place was found. */
export function orderLearningRows<T extends { learning: LearningLike }>(
  rows: T[],
  ctx: OrderContext,
): { row: T; determined: boolean }[] {
  return sortChronologicalDetailed(
    rows.map((row, i) => ({ key: row, position: row.learning.at, rank: i })),
    ctx,
  ).map(({ key, determined }) => ({ row: key, determined }))
}

/** One state per item the entry has learnings for, in first-appearance order. */
export function entryKnowledgeAsOf(
  rows: EntryLearningRow[],
  position: Position,
  ctx: OrderContext,
): { itemId: string; title: string; state: Knows }[] {
  const byItem = new Map<string, { title: string; learnings: LearningLike[] }>()
  for (const r of rows) {
    const g = byItem.get(r.item.id)
    if (g) g.learnings.push(r.learning)
    else byItem.set(r.item.id, { title: r.item.title, learnings: [r.learning] })
  }
  return [...byItem].map(([itemId, g]) => ({
    itemId,
    title: g.title,
    state: knowsAsOf(g.learnings, position, ctx),
  }))
}

/** Learn and forget events as Chronicle rows (`forgot` ids keep them unique). */
export function chronicleKnowledgeEvents(rows: EntryLearningRow[]): ChronicleExtra[] {
  return rows.flatMap((r, i) => [
    { id: r.learning.id, kind: 'knowledge', label: r.item.title, position: r.learning.at, rank: i * 2 },
    ...(r.learning.forgottenAt
      ? [
          {
            id: `${r.learning.id}:forgot`,
            kind: 'knowledge-forget',
            label: r.item.title,
            position: r.learning.forgottenAt,
            rank: i * 2 + 1,
          },
        ]
      : []),
  ])
}

/** For the store's save check: forgetting definitely before or at the learning. Unknown order passes. */
export const forgottenBeforeLearned =
  (ctx: OrderContext) =>
  (learnedAt: Position, forgottenAt: Position): boolean =>
    ['before', 'equal'].includes(compare(forgottenAt, learnedAt, ctx))

/** Items matching the query (title, tags, description text) and carrying every picked tag. */
export function filterItems<T extends { title: string; tags: string[]; description: unknown }>(
  items: T[],
  query: string,
  tags: string[],
  descriptionText: (doc: unknown) => string,
): T[] {
  const q = query.trim().toLowerCase()
  return items.filter(
    (k) =>
      tags.every((tag) => k.tags.includes(tag)) &&
      (!q ||
        k.title.toLowerCase().includes(q) ||
        k.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        descriptionText(k.description).toLowerCase().includes(q)),
  )
}
