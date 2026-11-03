import type { Stats } from '../project/schemas/stats'

export type Session = Stats['sessions'][number]

/** A session ends when the gap since the last edit is at least this long (exactly 10 min ends it). */
export const IDLE_MS = 10 * 60_000

export interface EditResult {
  /** the session this edit ended (idle gap), if any */
  closed: Session | null
  current: Session
}

export interface SessionTracker {
  /** Records one edit (`delta` = net words added, negative for deletions) at time `at` (ms). */
  edit(at: number, delta: number): EditResult
  /** The open session (end = last edit), or null. */
  current(): Session | null
  /** True while the open session has not hit the idle limit at `now`. */
  isActive(now: number): boolean
  /** Ends the open session at its last edit; null when none. */
  close(): Session | null
}

/** Sessions start at the first edit; no edit, no session. */
export function createSessionTracker(newId: () => string): SessionTracker {
  let open: { id: string; start: number; last: number; net: number } | null = null
  const view = (o: NonNullable<typeof open>): Session => ({
    id: o.id,
    start: new Date(o.start).toISOString(),
    end: new Date(o.last).toISOString(),
    net: o.net,
  })
  return {
    edit(at, delta) {
      let closed: Session | null = null
      if (open && at - open.last >= IDLE_MS) {
        closed = view(open)
        open = null
      }
      if (!open) open = { id: newId(), start: at, last: at, net: 0 }
      open.net += delta
      open.last = Math.max(open.last, at)
      return { closed, current: view(open) }
    },
    current: () => (open ? view(open) : null),
    isActive: (now) => !!open && now - open.last < IDLE_MS,
    close() {
      const s = open ? view(open) : null
      open = null
      return s
    },
  }
}

/** Replaces the session with the same id, or appends it. */
export function upsertSession(list: Session[], s: Session): Session[] {
  const i = list.findIndex((x) => x.id === s.id)
  if (i < 0) return [...list, s]
  const next = list.slice()
  next[i] = s
  return next
}
