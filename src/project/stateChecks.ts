import { compare, type OrderContext, type Position } from '../timeline/order'

export interface StateLike {
  id: string
  kindId: string
  value: string
  from: Position
  until: Position | null
  final: boolean
}

export interface KindLike {
  id: string
  exclusive: boolean
}

export interface StateOverlap<S extends StateLike = StateLike> {
  kindId: string
  a: S
  b: S
}

/** Periods are half-open [from, until); a period with no known start-before-end (empty or reversed) is skipped. */
function validPeriod(s: StateLike, ctx: OrderContext): boolean {
  if (!s.until) return true
  const o = compare(s.from, s.until, ctx)
  return o === 'before' || o === 'unknown'
}

/** `x` is definitely before `end`; an open end (null) is always later. Equal and unknown never count. */
const startsBefore = (x: Position, end: Position | null, ctx: OrderContext) =>
  end === null || compare(x, end, ctx) === 'before'

/**
 * Pairs of states of one exclusive kind whose periods definitely overlap. Each pair once, in array
 * order. Unknown order is never an overlap.
 */
export function overlappingStates<S extends StateLike>(
  states: S[],
  kinds: KindLike[],
  ctx: OrderContext,
): StateOverlap<S>[] {
  const exclusive = new Set(kinds.filter((k) => k.exclusive).map((k) => k.id))
  const out: StateOverlap<S>[] = []
  for (let i = 0; i < states.length; i++) {
    const a = states[i]
    if (!exclusive.has(a.kindId) || !validPeriod(a, ctx)) continue
    for (let j = i + 1; j < states.length; j++) {
      const b = states[j]
      if (b.kindId !== a.kindId || !validPeriod(b, ctx)) continue
      // Two open periods overlap whatever their starts, but unrelated starts are "unknown": not flagged.
      const bothOpen = a.until === null && b.until === null
      if (bothOpen && compare(a.from, b.from, ctx) === 'unknown') continue
      if (startsBefore(a.from, b.until, ctx) && startsBefore(b.from, a.until, ctx))
        out.push({ kindId: a.kindId, a, b })
    }
  }
  return out
}

/** Positions definitely after the start of a final state; each reported once with the first such state. */
export function appearsAfterFinal<S extends StateLike, T extends { id: string; position: Position }>(
  states: S[],
  positions: T[],
  ctx: OrderContext,
): { item: T; state: S }[] {
  const finals = states.filter((s) => s.final)
  const out: { item: T; state: S }[] = []
  for (const item of positions) {
    const state = finals.find((s) => compare(item.position, s.from, ctx) === 'after')
    if (state) out.push({ item, state })
  }
  return out
}
