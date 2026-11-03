import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { newId } from '../project/ids'
import type { ItemStatus } from '../project/rules'
import { parseFile } from '../project/serialize'
import { useProjectStore } from '../project/store'
import { STORY_MAP_FILE, storyMapSchema, type StoryMap } from '../project/schemas/storyMap'
import type { FileError } from '../project/types'
import { emptyStoryMap } from './ops'

export const useStoryMapStore = defineStore('storyMap', () => {
  const projectStore = useProjectStore()

  const doc = shallowRef<StoryMap | null>(null)
  const status = ref<'none' | ItemStatus>('none')
  const error = ref<FileError | null>(null)
  let seen = -1

  const map = computed<StoryMap>(() => doc.value ?? emptyStoryMap())
  const readOnly = computed(() => projectStore.readOnly)

  function set(next: StoryMap | null, st: 'none' | ItemStatus, err: FileError | null = null) {
    doc.value = next
    status.value = st
    error.value = err
  }

  async function load(): Promise<void> {
    const p = projectStore.project
    const ref = p?.manifest.storyMap
    if (!p || !ref) return set(null, 'none')
    const text = await p.io.readText(ref.path)
    seen = projectStore.itemVersion(ref.path)
    if (text === null) return set(null, 'missing')
    const r = parseFile(storyMapSchema, text, ref.path)
    if (r.ok) set(r.value, 'ok')
    else set(null, 'invalid', r.error)
  }

  function reset(): void {
    set(null, 'none')
    seen = -1
  }

  // The project store reloads files changed on disk and bumps their version.
  watch(
    () => {
      const ref = projectStore.project?.manifest.storyMap
      return ref ? projectStore.itemVersion(ref.path) : -1
    },
    async (version) => {
      if (version !== -1 && version !== seen) await load()
    },
  )

  /** Saves `next`; creates the file on the first change. false when refused or unavailable. */
  async function save(next: StoryMap): Promise<boolean> {
    const p = projectStore.project
    if (!p || p.readOnly) return false
    if (status.value !== 'none' && status.value !== 'ok') return false
    if (next === map.value) return true
    const checked = storyMapSchema.safeParse(next)
    if (!checked.success) return false
    const ref = p.manifest.storyMap
    if (ref) {
      if (!projectStore.updateItem(ref.path, storyMapSchema, checked.data)) return false
    } else {
      await p.saveItem(STORY_MAP_FILE, storyMapSchema, checked.data)
      projectStore.setStoryMapRef({ id: newId(), path: STORY_MAP_FILE })
      seen = projectStore.itemVersion(STORY_MAP_FILE)
    }
    set(checked.data, 'ok')
    return true
  }

  /** Applies a pure map operation and saves the result. */
  const edit = (op: (m: StoryMap) => StoryMap) => save(op(map.value))

  return { map, status, error, readOnly, load, reset, save, edit }
})
