import { ref } from 'vue'
import { useSettingsStore } from '../settings/store'

/** True while the tour popover is on screen. */
export const tourOpen = ref(false)

export function startTour(): void {
  tourOpen.value = true
}

/** Skip, Done and Esc all end here; the tour then never starts by itself again. */
export function dismissTour(): void {
  tourOpen.value = false
  useSettingsStore().setTourSeen(true)
}

/** The tour starts by itself once, when a book is open and it was never seen. */
export function shouldAutoStart(s: {
  settingsLoaded: boolean
  seen: boolean
  bookOpen: boolean
  running: boolean
}): boolean {
  return s.settingsLoaded && !s.seen && s.bookOpen && !s.running
}
