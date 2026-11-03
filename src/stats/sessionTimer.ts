import { ref } from 'vue'
import { createTimer } from './timer'

// One timer for the whole app run so it keeps going when leaving the Write page; never saved.
const timer = createTimer()
const running = ref(false)
const tick = ref(0)
let handle: ReturnType<typeof setInterval> | null = null

function sync(): void {
  running.value = timer.running()
  tick.value++
  if (running.value && handle === null) handle = setInterval(() => tick.value++, 1000)
  if (!running.value && handle !== null) {
    clearInterval(handle)
    handle = null
  }
}

export function useSessionTimer() {
  return {
    running,
    /** read inside a computed/template to follow the clock */
    elapsed: () => (void tick.value, timer.elapsed()),
    toggle() {
      if (timer.running()) timer.pause()
      else timer.start()
      sync()
    },
    reset() {
      timer.reset()
      sync()
    },
  }
}
