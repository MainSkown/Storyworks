import { openEntry } from '../codex/openEntry'
import { pendingVariableId, variablesOpen } from '../composables/variablesPanel'
import type { MechanicLink } from '../project/schemas/mechanic'
import { useProjectStore } from '../project/store'
import { findNode } from '../project/tree'
import { openTarget } from '../search/open'
import { clearStoryMapSelection, selectedBoxId } from '../storymap/selection'
import { openMechanic } from './openMechanic'

/** Opens what a mechanic link points at (callers do not offer this for broken links). */
export async function openLink(link: MechanicLink): Promise<void> {
  const { router } = await import('../router')
  switch (link.kind) {
    case 'variable':
      variablesOpen.value = true
      pendingVariableId.value = link.id
      await router.push({ name: 'write' })
      return
    case 'item': {
      const type = findNode(useProjectStore().tree, link.id)?.type
      if (type === 'scene' || type === 'conversation') await openTarget({ id: link.id, kind: type })
      return
    }
    case 'beat':
      clearStoryMapSelection()
      selectedBoxId.value = link.id
      await router.push({ name: 'storymap' })
      return
    case 'entry':
      return openEntry(link.id)
    case 'mechanic':
      return openMechanic(link.id)
  }
}
