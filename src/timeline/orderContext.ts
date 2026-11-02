import { computed, type ComputedRef } from 'vue'
import { useTimelinesStore } from './store'
import type { OrderContext } from './order'

/** Order context from the book's calendar and loaded timelines; a new one whenever either is replaced. */
export function useOrderContext(): ComputedRef<OrderContext> {
  const store = useTimelinesStore()
  return computed(() => {
    const byId = new Map(store.loadedTimelines.map((t) => [t.id, t]))
    return { calendar: store.calendar, timeline: (id: string) => byId.get(id) }
  })
}
