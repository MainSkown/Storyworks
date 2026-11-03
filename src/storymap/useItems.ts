import { computed } from 'vue'
import { useProjectStore } from '../project/store'
import type { RouteRef } from '../project/schemas/route'
import type { StoryBox } from '../project/schemas/storyMap'
import { findNode } from '../project/tree'
import { gameItems, type GameItem } from './items'

export type BoxState = 'live' | 'trashed' | 'deleted'

/** Scripts and conversations of the open project, reactive to the tree and the trash. */
export function useStoryItems() {
  const project = useProjectStore()
  const items = computed<GameItem[]>(() =>
    gameItems({ manuscript: project.tree, trash: project.trash }),
  )
  const byId = computed(() => new Map(items.value.map((i) => [i.id, i])))
  const liveIds = computed(() => items.value.filter((i) => !i.trashed).map((i) => i.id))

  const itemOf = (box: StoryBox): GameItem | null =>
    box.kind === 'item' ? (byId.value.get(box.itemId) ?? null) : null
  const stateOf = (box: StoryBox): BoxState | null =>
    box.kind !== 'item'
      ? null
      : !itemOf(box)
        ? 'deleted'
        : itemOf(box)!.trashed
          ? 'trashed'
          : 'live'

  /** Route tags of a live or trashed item. */
  function routesOf(itemId: string): RouteRef[] {
    return (
      findNode(project.tree, itemId)?.routes ??
      project.trash.find((t) => t.id === itemId)?.routes ??
      []
    )
  }
  return { items, byId, liveIds, itemOf, stateOf, routesOf }
}
