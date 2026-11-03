import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { newId } from '../project/ids'
import { emptyStats } from '../project/schemas/stats'
import { useProjectStore } from '../project/store'
import { addToDay, dayKey, displayNet, goalMet, netOn } from './days'
import { createSessionTracker, upsertSession, type Session } from './sessions'
import { streaks as computeStreaks } from './streak'

export interface Progress {
  done: number
  goal: number
  /** done / goal, capped at 1 */
  fraction: number
  met: boolean
}

const progress = (done: number, goal: number | null | undefined): Progress | null =>
  goal && goal > 0 ? { done, goal, fraction: Math.min(1, done / goal), met: goalMet(done, goal) } : null

/**
 * Writing stats of the open book (stats.json). The file lives in the project store (autosaved,
 * created on the first edit); this store turns edits into days and sessions.
 */
export const useStatsStore = defineStore('stats', () => {
  const project = useProjectStore()
  let tracker = createSessionTracker(newId)
  const live = shallowRef<Session | null>(null)
  /** bumped on edits so "today" follows the clock without a timer */
  const clock = ref(Date.now())

  const data = computed(() => project.stats ?? emptyStats())
  const invalid = computed(() => project.statsInvalid)
  const days = computed(() => data.value.days)
  const sessions = computed(() => data.value.sessions)
  const today = computed(() => dayKey(clock.value))
  const todayNet = computed(() => netOn(days.value, today.value))
  const dailyGoal = computed(() => {
    void project.revision
    return project.project?.manifest.goals.daily ?? null
  })
  const bookGoal = computed(() => {
    void project.revision
    return project.project?.manifest.goals.book ?? null
  })
  /** today's words vs the daily goal; null with no goal */
  const goalProgress = computed(() => progress(todayNet.value, dailyGoal.value))
  /** whole-book words vs the book target; null with no target */
  const bookProgress = computed(() => progress(displayNet(project.wordCounts.get('') ?? 0), bookGoal.value))
  const streaks = computed(() => computeStreaks(days.value, today.value, dailyGoal.value))
  /** the session in progress, null when idle for 10 minutes or no edit yet */
  const liveSession = computed(() => (live.value && tracker.isActive(clock.value) ? live.value : null))

  /**
   * Counts one real edit (net words added, negative for deletions) now. Called by the project store
   * for editor changes only, never for loading, switching or restoring a scene.
   * false = nothing written (read-only, invalid stats.json, no book).
   */
  async function recordEdit(delta: number): Promise<boolean> {
    const p = project.project
    if (!p || p.readOnly) return false
    const at = Date.now()
    clock.value = at
    const { closed, current } = tracker.edit(at, delta)
    live.value = current
    return project.changeStats((cur) => {
      let list = cur.sessions
      if (closed) list = upsertSession(list, closed)
      return { ...cur, days: addToDay(cur.days, at, delta), sessions: upsertSession(list, current) }
    })
  }

  /** Forgets the open session (book closed or switched); what was recorded is already in the file. */
  function reset(): void {
    tracker = createSessionTracker(newId)
    live.value = null
  }

  function refreshClock(): void {
    clock.value = Date.now()
  }

  return {
    invalid,
    days,
    sessions,
    today,
    todayNet,
    dailyGoal,
    bookGoal,
    goalProgress,
    bookProgress,
    streaks,
    liveSession,
    recordEdit,
    refreshClock,
    reset,
  }
})
