import { onBeforeUnmount, onMounted } from 'vue'
import { useStatsStore } from './store'

/** Keeps "today" right: refresh on window focus and at the next local midnight. */
export function useClockRefresh(): void {
  const stats = useStatsStore()
  let timer: ReturnType<typeof setTimeout> | null = null

  function arm(): void {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
    timer = setTimeout(() => {
      stats.refreshClock()
      arm()
    }, next.getTime() - now.getTime())
  }
  const onFocus = () => stats.refreshClock()

  onMounted(() => {
    stats.refreshClock()
    window.addEventListener('focus', onFocus)
    arm()
  })
  onBeforeUnmount(() => {
    window.removeEventListener('focus', onFocus)
    if (timer) clearTimeout(timer)
  })
}
