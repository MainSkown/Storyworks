import { toOrdinal, validateDate, type CalendarDate } from '../calendar'
import { compare, positionDate, type OrderContext, type Position } from './order'

export interface ChronoItem<T> {
  key: T
  position: Position | null
  /** Tie-break among items with no known order between them (e.g. timeline order). */
  rank: number
}

/** Calendar ordinal of a position's date; null when undated, missing or not a real date. */
export function positionOrdinal(p: Position, ctx: OrderContext): number | null {
  const date: CalendarDate | null = positionDate(p, ctx)
  return date && validateDate(ctx.calendar, date).ok ? toOrdinal(ctx.calendar, date) : null
}

/**
 * Items in chronological order. Items whose order is known (dated, or related to another item by
 * `compare`) come first, topologically sorted; ties break by date, rank, input index. The rest
 * (positioned but unrelated and undated, then position-less) follow by rank, then input index. Never throws,
 * even if the relation is cyclic.
 */
export function sortChronological<T>(items: ChronoItem<T>[], ctx: OrderContext): T[] {
  return sortChronologicalDetailed(items, ctx).map((r) => r.key)
}

/** Same order as `sortChronological`; `determined` is false for the items whose place is only a fallback. */
export function sortChronologicalDetailed<T>(
  items: ChronoItem<T>[],
  ctx: OrderContext,
): { key: T; determined: boolean }[] {
  const n = items.length
  const ord = items.map((it) => (it.position ? positionOrdinal(it.position, ctx) : null))
  const out: number[] = []

  // Directed edges i -> j where i is definitely before j.
  const next: number[][] = items.map(() => [])
  const indeg = new Array<number>(n).fill(0)
  const related = new Array<boolean>(n).fill(false)
  for (let i = 0; i < n; i++) {
    const pi = items[i].position
    if (!pi) continue
    for (let j = i + 1; j < n; j++) {
      const pj = items[j].position
      if (!pj) continue
      const o =
        ord[i] !== null && ord[j] !== null
          ? Math.sign((ord[i] as number) - (ord[j] as number))
          : orderToSign(compare(pi, pj, ctx))
      if (o === null) continue
      related[i] = related[j] = true
      if (o < 0) {
        next[i].push(j)
        indeg[j]++
      } else if (o > 0) {
        next[j].push(i)
        indeg[i]++
      }
    }
  }

  const determined = items.map((it, i) => it.position !== null && (ord[i] !== null || related[i]))
  const tie = (a: number, b: number) => {
    const da = ord[a]
    const db = ord[b]
    if (da !== db) {
      if (da === null) return 1
      if (db === null) return -1
      return da - db
    }
    return items[a].rank - items[b].rank || a - b
  }

  const placed = new Array<boolean>(n).fill(false)
  const available: number[] = []
  for (let i = 0; i < n; i++) if (determined[i] && indeg[i] === 0) available.push(i)
  while (available.length) {
    let best = 0
    for (let k = 1; k < available.length; k++) if (tie(available[k], available[best]) < 0) best = k
    const i = available.splice(best, 1)[0]
    placed[i] = true
    out.push(i)
    for (const j of next[i]) if (--indeg[j] === 0) available.push(j)
  }

  // Cycle guard: whatever is still unplaced, by the same tie-break.
  const rest: number[] = []
  for (let i = 0; i < n; i++) if (determined[i] && !placed[i]) rest.push(i)
  out.push(...rest.sort(tie))

  const undetermined: number[] = []
  for (let i = 0; i < n; i++) if (!determined[i]) undetermined.push(i)
  const byRank = (a: number, b: number) => items[a].rank - items[b].rank || a - b
  out.push(...undetermined.filter((i) => items[i].position).sort(byRank))
  out.push(...undetermined.filter((i) => !items[i].position).sort(byRank))

  return out.map((i) => ({ key: items[i].key, determined: determined[i] }))
}

function orderToSign(o: ReturnType<typeof compare>): number | null {
  return o === 'before' ? -1 : o === 'after' ? 1 : o === 'equal' ? 0 : null
}
