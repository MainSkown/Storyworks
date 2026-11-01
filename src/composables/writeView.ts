import { ref, watch } from 'vue'

export type WriteViewMode = 'editor' | 'corkboard'

const KEY = 'storyworks.writeView'

function load(): WriteViewMode {
  try {
    return localStorage.getItem(KEY) === 'corkboard' ? 'corkboard' : 'editor'
  } catch {
    return 'editor'
  }
}

/** Editor or corkboard in the Write section; remembered per machine. */
export const writeView = ref<WriteViewMode>(load())

watch(writeView, (v) => {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
})
