import { computed } from 'vue'
import { useCodexStore } from '../codex/store'
import { useProjectStore } from '../project/store'
import { useStoryItems } from '../storymap/useItems'
import { useStoryMapStore } from '../storymap/store'
import { useVariablesStore } from '../variables/store'
import { buildLinkNames } from './linkLabels'
import { useMechanicsStore } from './mechanicsStore'

/** Live names of every link target, from the open project's stores. */
export function useLinkNames() {
  const project = useProjectStore()
  const variables = useVariablesStore()
  const storyMap = useStoryMapStore()
  const codex = useCodexStore()
  const mechanics = useMechanicsStore()
  const { items } = useStoryItems()
  return computed(() =>
    buildLinkNames({
      variables: variables.variables,
      items: items.value,
      beats: storyMap.map.boxes.flatMap((b) => (b.kind === 'beat' ? [{ id: b.id, text: b.text }] : [])),
      entries: codex.entries,
      mechanics: mechanics.mechanicEntries,
      trash: project.trash,
    }),
  )
}
