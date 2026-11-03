import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useCodexStore } from '../codex/store'
import { selectedItemId as selectedKnowledgeId } from '../knowledge/openItem'
import { useKnowledgeStore } from '../knowledge/store'
import { useProjectStore } from '../project/store'
import { findNode } from '../project/tree'
import { useRulesStore } from '../rules/store'
import { useTimelinesStore } from '../timeline/store'
import { loadBodies, sceneParts } from './build'
import { AREAS, createIndex, type Area, type SearchIndex } from './index'
import { openTarget, type OpenTarget } from './open'
import { search, type SearchResults } from './query'
import { loadRecents, saveRecents } from './recents'
import { pushRecent, switchTo, type SwitchEntry } from './switcher'
import { createAreaSync } from './sync'
import { entryUnits, knowledgeUnits, manuscriptUnits, ruleUnits, timelineUnits } from './units'

const EDIT_DELAY_MS = 400

const makeSyncs = (ix: SearchIndex) =>
  Object.fromEntries(AREAS.map((a) => [a, createAreaSync(ix, a)])) as Record<
    Area,
    ReturnType<typeof createAreaSync>
  >

/**
 * In-memory search index of the open book. One watcher over the stores' data keeps it equal to
 * what is listed (so trashed items vanish and restored ones return); scene text arrives through
 * a hook on `setSceneContent`, and bodies not read yet are loaded in the background.
 */
export const useSearchStore = defineStore('search', () => {
  const project = useProjectStore()
  const rules = useRulesStore()
  const codex = useCodexStore()
  const timelines = useTimelinesStore()
  const knowledge = useKnowledgeStore()

  let index = createIndex()
  let syncs = makeSyncs(index)
  let active = false
  let root = ''
  let generation = 0
  let filling = false
  let refill = false
  const edits = new Map<string, unknown>()
  let editTimer: ReturnType<typeof setTimeout> | undefined
  /** Last word count seen per scene: a different one without an in-app edit means the file changed on disk. */
  const seenWords = new Map<string, number>()

  /** Bumped whenever the index changed; open overlays re-run their query on it. */
  const version = ref(0)
  /** Scene bodies are still being read, so results may be incomplete. */
  const loadingBodies = ref(false)
  const recents = ref<string[]>([])

  // ---- keeping the index equal to the stores ----

  function syncAll(): void {
    if (!active) return
    syncs.manuscript.sync(manuscriptUnits(project.tree))
    syncs.rules.sync(ruleUnits(rules.rules))
    syncs.codex.sync(entryUnits(codex.entries))
    syncs.timelines.sync(timelineUnits(timelines.loadedTimelines))
    syncs.knowledge.sync(knowledgeUnits(knowledge.items))
    version.value++
    void fillBodies()
  }

  async function readBody(id: string): Promise<unknown | null> {
    const path = findNode(project.tree, id)?.path
    if (!path) return null
    try {
      const r = await project.loadScene(path)
      return r.ok ? r.value.content : null
    } catch {
      return null
    }
  }

  /** Reads scene bodies not indexed yet, a few at a time. Calls during a run just ask for another pass. */
  async function fillBodies(): Promise<void> {
    if (filling) {
      refill = true
      return
    }
    if (index.pendingBodies().length === 0) return
    filling = true
    const mine = generation
    loadingBodies.value = true
    try {
      do {
        refill = false
        await loadBodies(index, readBody, {
          isCancelled: () => mine !== generation,
          pause: async () => {
            version.value++
            await new Promise<void>((r) => setTimeout(r, 0))
          },
        })
      } while (refill && mine === generation)
    } finally {
      filling = false
      if (mine === generation) {
        loadingBodies.value = false
        version.value++
      }
    }
  }

  function applyEdits(): void {
    clearTimeout(editTimer)
    for (const [id, content] of edits) if (index.has(id)) index.setParts(id, sceneParts(content))
    edits.clear()
  }

  // Edits arrive per keystroke: keep the latest per scene and index it once typing pauses.
  project.$onAction(({ name, args }) => {
    if (name !== 'setSceneContent' || !active) return
    const [id, content, words] = args as [string, unknown, number]
    edits.set(id, content)
    seenWords.set(id, words)
    clearTimeout(editTimer)
    editTimer = setTimeout(() => {
      applyEdits()
      version.value++
    }, EDIT_DELAY_MS)
  }, true)

  async function reloadBody(id: string): Promise<void> {
    const mine = generation
    const content = await readBody(id)
    if (mine === generation && content !== null && index.has(id) && !edits.has(id)) {
      index.setParts(id, sceneParts(content))
      version.value++
    }
  }

  // A scene file changed outside the editor (reloaded after a disk change): its word count moves.
  watch(
    () => project.wordCounts,
    (counts) => {
      if (!active) return
      for (const item of index.items('manuscript')) {
        if (item.kind !== 'scene' || item.parts === null) continue
        const now = counts.get(item.id) ?? 0
        const was = seenWords.get(item.id)
        seenWords.set(item.id, now)
        if (was !== undefined && was !== now) void reloadBody(item.id)
      }
    },
  )

  watch(
    () => [project.tree, rules.rules, codex.entries, timelines.loadedTimelines, knowledge.items],
    syncAll,
  )

  // ---- lifecycle ----

  function reset(): void {
    active = false
    generation++
    clearTimeout(editTimer)
    edits.clear()
    seenWords.clear()
    index = createIndex()
    syncs = makeSyncs(index)
    recents.value = []
    loadingBodies.value = false
    filling = false
    refill = false
    version.value++
  }

  function start(): void {
    reset()
    if (!project.project) return
    root = project.rootPath ?? ''
    recents.value = loadRecents(root)
    active = true
    syncAll()
  }

  watch(() => project.openedCount, start, { immediate: true })
  watch(
    () => project.project,
    (p) => {
      if (!p) reset()
    },
  )

  // ---- recents ----

  function touch(id: string): void {
    if (!active || !index.has(id)) return
    if (recents.value[0] === id) return
    recents.value = pushRecent(recents.value, id)
    saveRecents(root, recents.value)
  }

  // Anything the writer opens counts, not only what was opened from the overlays.
  for (const source of [
    () => project.selectedId,
    () => codex.selectedId,
    () => rules.selectedId,
    () => timelines.currentId,
    () => timelines.selectedNodeId,
    () => selectedKnowledgeId.value,
  ])
    watch(source, (id) => id && touch(id))

  // ---- queries ----

  function find(text: string): SearchResults {
    applyEdits()
    return search(index, text, { limit: Number.MAX_SAFE_INTEGER })
  }

  function switchList(text: string): SwitchEntry[] {
    applyEdits()
    return switchTo(index, text, recents.value)
  }

  async function open(target: OpenTarget): Promise<void> {
    touch(target.id)
    await openTarget(target)
  }

  return { version, loadingBodies, recents, find, switchList, open, touch }
})
