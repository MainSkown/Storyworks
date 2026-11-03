import { ref } from 'vue'

/** Open state of the two overlays; only one is open at a time. */
export const searchOpen = ref(false)
export const switcherOpen = ref(false)

export function openSearch(): void {
  switcherOpen.value = false
  searchOpen.value = true
}

export function openSwitcher(): void {
  searchOpen.value = false
  switcherOpen.value = true
}
