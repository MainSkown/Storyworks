import { useCodexStore } from '../codex/store'
import { extractLines } from '../game/playthrough'
import { useGlossaryStore } from '../gamedoc/glossaryStore'
import { buildLinkNames } from '../gamedoc/linkLabels'
import { useMechanicsStore } from '../gamedoc/mechanicsStore'
import { useOverviewStore } from '../gamedoc/overviewStore'
import { useProjectStore } from '../project/store'
import { useTimelinesStore } from '../timeline/store'
import type { Link } from '../project/links'
import { findNode } from '../project/tree'
import { gameItems } from '../storymap/items'
import { useStoryMapStore } from '../storymap/store'
import { useVariablesStore } from '../variables/store'
import type { ExportSource } from './prepare'
import type { GameSource } from './gameDoc'
import type { ScriptSource } from './scriptDoc'

/** Adapts the open project's stores to the export input. Null when no project is open. */
export function projectExportSource(
  appendixTexts: ExportSource['appendixTexts'],
): ExportSource | null {
  const project = useProjectStore()
  const m = project.project?.manifest
  const ix = project.linkIndex()
  if (!m || !ix) return null
  return {
    meta: { title: m.title, author: m.author, language: m.language },
    manuscript: project.tree,
    loadScene: async (path) => {
      const r = await project.loadScene(path)
      return r.ok ? { ok: true, value: r.value } : { ok: false, message: r.error.message }
    },
    readAsset: (path) => project.readAsset(path),
    entries: useCodexStore().entries,
    links: [...ix.byOwner().values()].flat() as Link[],
    timelines: useTimelinesStore().loadedTimelines,
    calendar: useTimelinesStore().calendar,
    appendixTexts,
  }
}

/** Adapts the open screenplay project to the screenplay export input. Null when no project is open. */
export function projectScriptSource(): ScriptSource | null {
  const project = useProjectStore()
  const m = project.project?.manifest
  if (!m) return null
  return {
    meta: { title: m.title, author: m.author, language: m.language },
    titlePage: { ...m.titlePage },
    manuscript: project.tree,
    loadScene: async (path) => {
      const r = await project.loadScene(path)
      return r.ok ? { ok: true, value: r.value } : { ok: false, message: r.error.message }
    },
    numbers: project.sceneNumbering.byBlock,
  }
}

/** Adapts the open game project to the game export input (unsaved edits included). Null when no project is open. */
export function projectGameSource(): GameSource | null {
  const project = useProjectStore()
  const m = project.project?.manifest
  if (!m) return null
  const vars = useVariablesStore().variables
  const codex = useCodexStore()
  const storyMap = useStoryMapStore()
  const mechanics = useMechanicsStore()
  const timelines = useTimelinesStore().loadedTimelines
  const glossary = useGlossaryStore().entries
  return {
    meta: { title: m.title, author: m.author, language: m.language },
    variables: vars,
    manuscript: project.tree,
    loadConversation: async (id) => {
      const r = await project.loadConversation(id)
      return r.ok ? { ok: true, value: r.value } : { ok: false }
    },
    loadScriptLines: async (id) => {
      const path = findNode(m.manuscript, id)?.path
      const r = path ? await project.loadScene(path) : null
      return r?.ok ? extractLines(r.value.content) : null
    },
    entries: codex.entries,
    timelines,
    storyMap: storyMap.map,
    overview: useOverviewStore().content,
    categories: mechanics.categories,
    mechanics: mechanics.mechanics,
    glossary,
    linkNames: buildLinkNames({
      variables: vars,
      items: gameItems(m),
      beats: storyMap.map.boxes.flatMap((b) => (b.kind === 'beat' ? [{ id: b.id, text: b.text }] : [])),
      entries: codex.entries,
      mechanics: mechanics.mechanics,
      trash: project.trash,
    }),
  }
}
