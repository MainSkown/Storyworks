import { ref, watch } from 'vue'

const KEY = 'storyworks.commentRail'

function load(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'closed'
  } catch {
    return true
  }
}

/** Margin comments shown beside the sheet; remembered per machine. */
export const commentRailOpen = ref(load())

watch(commentRailOpen, (v) => {
  try {
    localStorage.setItem(KEY, v ? 'open' : 'closed')
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
})
