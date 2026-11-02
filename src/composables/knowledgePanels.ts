import { computed } from 'vue'
import { describeEntry } from '../codex/pick'
import { useCodexStore } from '../codex/store'
import { useKnowledgeStore } from '../knowledge/store'
import { groupUsesByPair } from '../knowledge/pairPick'
import { useProjectStore } from '../project/store'
import { findNode } from '../project/tree'

export interface SceneKnowledgeUse {
  itemId: string
  entryId: string
  /** Empty when the item or the entry is gone. */
  itemTitle: string
  entryName: string
  missing: 'item' | 'entry' | 'both' | null
  blocks: number
}

/** Knowledge (item, character) pairs used by passages of the open scene; gone ones marked. */
export const sceneKnowledgeUses = computed<SceneKnowledgeUse[]>(() => {
  const store = useProjectStore()
  void store.linkRevision
  const id = store.selectedId
  const ix = store.linkIndex()
  if (!ix || !id || findNode(store.tree, id)?.type !== 'scene') return []
  const know = useKnowledgeStore()
  const codex = useCodexStore()
  return groupUsesByPair(ix.linksFrom(id), id).map((u) => {
    const itemGone = !ix.isLive(u.itemId)
    const entryGone = !ix.isLive(u.entryId)
    return {
      ...u,
      itemTitle: itemGone ? '' : (know.items.find((i) => i.id === u.itemId)?.title ?? ''),
      entryName: entryGone ? '' : (describeEntry(codex.entries, codex.types, u.entryId)?.name ?? ''),
      missing: itemGone && entryGone ? 'both' : itemGone ? 'item' : entryGone ? 'entry' : null,
    }
  })
})
