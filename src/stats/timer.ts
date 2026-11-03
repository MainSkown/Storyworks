export interface Timer {
  start(): void
  pause(): void
  reset(): void
  running(): boolean
  /** Milliseconds run so far, including the current run. */
  elapsed(): number
}

/** Manual stopwatch; the clock is injected so tests need no real time. */
export function createTimer(now: () => number = Date.now): Timer {
  let before = 0
  let startedAt: number | null = null
  const elapsed = () => before + (startedAt === null ? 0 : now() - startedAt)
  return {
    start() {
      if (startedAt === null) startedAt = now()
    },
    pause() {
      before = elapsed()
      startedAt = null
    },
    reset() {
      before = 0
      startedAt = null
    },
    running: () => startedAt !== null,
    elapsed,
  }
}

/** `mm:ss`, or `h:mm:ss` from one hour. */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const s = String(total % 60).padStart(2, '0')
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${String(m).padStart(2, '0')}:${s}`
}
