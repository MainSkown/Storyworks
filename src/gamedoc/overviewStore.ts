import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ItemStatus } from '../project/rules'
import { gameOverviewSchema, type GameOverview } from '../project/schemas/gameOverview'
import { parseFile } from '../project/serialize'
import { useProjectStore } from '../project/store'
import type { FileError } from '../project/types'

export const useOverviewStore = defineStore('gameOverview', () => {
  const projectStore = useProjectStore()

  const doc = shallowRef<GameOverview | null>(null)
  const status = ref<'none' | ItemStatus>('none')
  const error = ref<FileError | null>(null)
  let seen = -1

  const content = computed(() => doc.value?.content ?? null)
  const readOnly = computed(() => projectStore.readOnly)

  function set(next: GameOverview | null, st: 'none' | ItemStatus, err: FileError | null = null) {
    doc.value = next
    status.value = st
    error.value = err
  }

  async function load(): Promise<void> {
    const p = projectStore.project
    const r = p?.manifest.gameOverview
    if (!p || !r) return set(null, 'none')
    const text = await p.io.readText(r.path)
    seen = projectStore.itemVersion(r.path)
    if (text === null) return set(null, 'missing')
    const parsed = parseFile(gameOverviewSchema, text, r.path)
    if (parsed.ok) set(parsed.value, 'ok')
    else set(null, 'invalid', parsed.error)
  }

  function reset(): void {
    set(null, 'none')
    seen = -1
  }

  // The project store reloads files changed on disk and bumps their version.
  watch(
    () => {
      const r = projectStore.project?.manifest.gameOverview
      return r ? projectStore.itemVersion(r.path) : -1
    },
    async (version) => {
      if (version !== -1 && version !== seen) await load()
    },
  )

  /** Records the new page for autosave. false = refused (read-only, invalid or missing file). */
  function setContent(next: Record<string, unknown>): boolean {
    const r = projectStore.project?.manifest.gameOverview
    if (!r || status.value !== 'ok' || !doc.value) return false
    const value: GameOverview = { ...doc.value, content: next }
    if (!projectStore.updateItem(r.path, gameOverviewSchema, value)) return false
    doc.value = value
    return true
  }

  return { content, status, error, readOnly, load, reset, setContent }
})
