import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { useProjectStore } from '../project/store'
import { gatherCheckData } from './gather'
import { runChecks } from './run'
import type { Finding, Severity } from './types'

export const useChecksStore = defineStore('checks', () => {
  const project = useProjectStore()

  const findings = shallowRef<Finding[]>([])
  /** ms since epoch of the last finished run; null before the first run or after close */
  const ranAt = ref<number | null>(null)
  const running = ref(false)
  const showIgnored = ref(false)
  let token = 0

  const ignoredIds = computed(() => project.ignoredIds)
  /** ignored.json is invalid: every finding is shown and nothing can be ignored (warn the writer) */
  const ignoredInvalid = computed(() => project.ignoredInvalid)
  const isIgnored = (f: Finding) => ignoredIds.value.has(f.id)

  const ignoredFindings = computed(() => findings.value.filter(isIgnored))
  /** What the page lists: not ignored, plus ignored ones while `showIgnored` is on. */
  const visible = computed(() =>
    showIgnored.value ? findings.value : findings.value.filter((f) => !isIgnored(f)),
  )
  /** Per severity, over `visible`. */
  const counts = computed(() => {
    const c: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
    for (const f of visible.value) c[f.severity]++
    return c
  })
  /** Errors and warnings that are not ignored (sidebar badge). */
  const badge = computed(
    () => findings.value.filter((f) => !isIgnored(f) && f.severity !== 'info').length,
  )

  /** Gathers the project data and runs the enabled checks. Overlapping runs: the latest wins. */
  async function run(): Promise<void> {
    const mine = ++token
    if (!project.project) {
      findings.value = []
      ranAt.value = null
      running.value = false
      return
    }
    running.value = true
    try {
      const data = await gatherCheckData()
      if (mine !== token) return
      findings.value = data ? runChecks(data, project.isCheckEnabled) : []
      ranAt.value = Date.now()
    } catch (e) {
      console.error('Could not run the checks', e)
    } finally {
      if (mine === token) running.value = false
    }
  }

  /** false = refused (read-only book or invalid ignored file). */
  const ignore = (id: string) => project.ignoreFinding(id)
  const unignore = (id: string) => project.unignoreFinding(id)

  // Run once a book has finished opening; clear on close.
  watch(
    () => project.openedCount,
    () => void run(),
  )
  watch(
    () => project.project,
    (p) => {
      if (!p) void run()
    },
  )

  return {
    findings,
    ranAt,
    running,
    showIgnored,
    visible,
    ignoredFindings,
    counts,
    badge,
    ignoredInvalid,
    run,
    ignore,
    unignore,
  }
})
