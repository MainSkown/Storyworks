import { computed } from 'vue'
import { resolveEntryRefs, sceneEntryIds, type EntryRef } from '../codex/entryRefs'
import { useCodexStore } from '../codex/store'
import type { CodexEntry } from '../project/schemas/codexEntry'
import { useProjectStore } from '../project/store'
import { findNode } from '../project/tree'
import { useTimelinesStore } from '../timeline/store'

/** Entries linked to blocks of the open scene, plus its POV entry (missing ones marked). */
export const sceneEntries = computed<EntryRef<CodexEntry>[]>(() => {
  const store = useProjectStore()
  void store.linkRevision
  const codex = useCodexStore()
  const id = store.selectedId
  if (!id || findNode(store.tree, id)?.type !== 'scene') return []
  const links = store.linkIndex()?.linksFrom(id) ?? []
  const ids = sceneEntryIds(links, id, store.sceneMeta.get(id)?.povId)
  return resolveEntryRefs(ids, codex.entries, codex.types)
})

/** The selected timeline node's codex entries (missing ones marked). */
export const nodeEntries = computed<EntryRef<CodexEntry>[]>(() => {
  const tl = useTimelinesStore()
  const codex = useCodexStore()
  const node = tl.current?.nodes.find((n) => n.id === tl.selectedNodeId)
  return node ? resolveEntryRefs(node.codexIds, codex.entries, codex.types) : []
})
