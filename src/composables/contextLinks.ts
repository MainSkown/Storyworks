import { computed, ref, watch, type Ref } from 'vue'
import { blockSnippet, buildProblems, type LinkProblem } from '../project/linkProblems'
import type { Link } from '../project/links'
import { useProjectStore } from '../project/store'
import { findNode } from '../project/tree'
import { describeTarget } from '../timeline/pick'
import { useTimelinesStore } from '../timeline/store'
import { currentBlock } from './currentBlock'
import { linksForBlock, type BlockLink } from './eventLinks'

/** Links of the paragraph holding the cursor. */
export const paragraphLinks = computed<BlockLink[]>(() => {
  const cur = currentBlock.value
  return cur?.blockId ? linksForBlock(cur.sceneId, cur.blockId) : []
})

/** Broken links owned by the selected scene. */
export const sceneProblems = computed<LinkProblem[]>(() => {
  const store = useProjectStore()
  void store.linkRevision
  const ix = store.linkIndex()
  const id = store.selectedId
  if (!ix || !id) return []
  const timelines = useTimelinesStore().loadedTimelines
  return buildProblems(ix.linksFrom(id), {
    targetMissing: (l) => ix.isBroken(l) || describeTarget(timelines, l.to, () => '') === null,
    passageMissing: ix.isPassageBroken,
  })
})

export interface Passage {
  link: Link
  sceneId: string
  blockId: string
  /** Null when the scene is gone. */
  sceneTitle: string | null
  /** The scene or block is gone. */
  missing: boolean
}

/** Passages linked to the selected timeline node. */
export const passagesForSelectedNode = computed<Passage[]>(() => {
  const store = useProjectStore()
  void store.linkRevision
  const tl = useTimelinesStore()
  const ix = store.linkIndex()
  if (!ix || !tl.current || !tl.selectedNodeId) return []
  return ix
    .linksTo({ item: tl.current.id, block: tl.selectedNodeId })
    .filter((l) => l.from.block !== undefined)
    .map((link) => ({
      link,
      sceneId: link.from.item,
      blockId: link.from.block!,
      sceneTitle: findNode(store.tree, link.from.item)?.title ?? null,
      missing: ix.isPassageBroken(link),
    }))
})

/** Snippets of linked blocks by link id; reloaded when the set of links changes, not on every save. */
export function useSnippets(
  items: () => readonly { linkId: string; sceneId: string; blockId: string }[],
): Ref<Record<string, string>> {
  const snippets = ref<Record<string, string>>({})
  let token = 0
  const key = computed(() => items().map((i) => `${i.linkId}:${i.sceneId}:${i.blockId}`).join('|'))
  watch(
    key,
    async () => {
      const mine = ++token
      const store = useProjectStore()
      const list = items()
      const byScene = new Map<string, typeof list>()
      for (const i of list) byScene.set(i.sceneId, [...(byScene.get(i.sceneId) ?? []), i])
      const next: Record<string, string> = {}
      for (const [sceneId, group] of byScene) {
        const path = findNode(store.tree, sceneId)?.path
        const r = path ? await store.loadScene(path) : null
        if (!r?.ok) continue
        for (const i of group) {
          const s = blockSnippet(r.value.content, i.blockId)
          if (s !== null) next[i.linkId] = s
        }
      }
      if (mine === token) snippets.value = next
    },
    { immediate: true },
  )
  return snippets
}
