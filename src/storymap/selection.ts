import { ref, shallowRef } from 'vue'
import type { StoryMap } from '../project/schemas/storyMap'
import type { DerivedArrow } from './ops'

/** Selection and view data of the Story map, shared with the context panel (the view publishes it). */
export const selectedBoxId = ref<string | null>(null)
/** A manual arrow id or an `auto:` derived arrow id. */
export const selectedArrowId = ref<string | null>(null)
/** The map as shown: stored boxes plus not-yet-saved item boxes. */
export const shownMap = shallowRef<StoryMap | null>(null)
export const derivedList = shallowRef<DerivedArrow[]>([])

export function clearStoryMapSelection(): void {
  selectedBoxId.value = null
  selectedArrowId.value = null
}
