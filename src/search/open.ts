import { jumpToBlock, jumpToNode, jumpToScene } from '../composables/useJump'
import { writeView } from '../composables/writeView'
import { openEntry } from '../codex/openEntry'
import { openKnowledgeItem } from '../knowledge/openItem'
import { useProjectStore } from '../project/store'
import { openRule } from '../rules/openRule'
import { useTimelinesStore } from '../timeline/store'
import type { ItemKind } from './index'

export interface OpenTarget {
  id: string
  kind: ItemKind
  parentId?: string
  /** Scenes: reveal this block. */
  blockId?: string
}

/** Opens the item through the existing jump helpers; scenes land on the matching block. */
export async function openTarget(t: OpenTarget): Promise<void> {
  const { router } = await import('../router')
  switch (t.kind) {
    case 'scene':
      if (t.blockId && (await jumpToBlock(t.id, t.blockId)).ok) return
      await jumpToScene(t.id)
      return
    case 'conversation':
    case 'chapter': {
      const p = useProjectStore()
      writeView.value = 'editor'
      p.openNote(null)
      p.selectedId = t.id
      await router.push({ name: 'write' })
      return
    }
    case 'entry':
      return openEntry(t.id)
    case 'rule':
      return openRule(t.id)
    case 'knowledge':
      return openKnowledgeItem(t.id)
    case 'timeline':
      useTimelinesStore().select(t.id)
      await router.push({ name: 'timelines' })
      return
    case 'node':
      if (t.parentId) await jumpToNode(t.parentId, t.id)
      return
  }
}
