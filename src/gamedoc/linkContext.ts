import { computed } from 'vue'
import type { LinkContext } from '../game/mechanicLinks'
import type { ManuscriptNode } from '../project/schemas/manifest'
import { useProjectStore } from '../project/store'
import type { TrashEntry } from '../project/types'
import { useCodexStore } from '../codex/store'
import { useStoryMapStore } from '../storymap/store'
import { useVariablesStore } from '../variables/store'
import { useMechanicsStore } from './mechanicsStore'

export interface LinkContextInput {
  variableIds: readonly string[]
  tree: readonly ManuscriptNode[]
  trash: readonly TrashEntry[]
  beatIds: readonly string[]
  entryIds: readonly string[]
  mechanicIds: readonly string[]
}

/** What link targets exist right now, and which are in the trash (a restore repairs those). */
export function buildLinkContext(i: LinkContextInput): LinkContext {
  const items = new Set<string>()
  const walk = (nodes: readonly ManuscriptNode[]) => {
    for (const n of nodes) {
      if (n.type === 'scene' || n.type === 'conversation') items.add(n.id)
      walk(n.children)
    }
  }
  walk(i.tree)
  const trashedIds = (...types: TrashEntry['type'][]) =>
    new Set(i.trash.filter((t) => types.includes(t.type)).map((t) => t.id))
  return {
    variable: { live: new Set(i.variableIds), trashed: new Set() },
    item: { live: items, trashed: trashedIds('scene', 'conversation') },
    beat: { live: new Set(i.beatIds), trashed: new Set() },
    entry: { live: new Set(i.entryIds), trashed: trashedIds('entry') },
    mechanic: { live: new Set(i.mechanicIds), trashed: trashedIds('mechanic') },
  }
}

/** Live link context from the open project's stores. */
export function useLinkContext() {
  const project = useProjectStore()
  const variables = useVariablesStore()
  const storyMap = useStoryMapStore()
  const codex = useCodexStore()
  const mechanics = useMechanicsStore()
  return computed(() =>
    buildLinkContext({
      variableIds: variables.variables.map((v) => v.id),
      tree: project.tree,
      trash: project.trash,
      beatIds: storyMap.map.boxes.filter((b) => b.kind === 'beat').map((b) => b.id),
      entryIds: codex.entries.map((e) => e.id),
      mechanicIds: mechanics.mechanicEntries.map((e) => e.id),
    }),
  )
}
