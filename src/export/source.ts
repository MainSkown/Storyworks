import { useCodexStore } from '../codex/store'
import { useProjectStore } from '../project/store'
import { useTimelinesStore } from '../timeline/store'
import type { Link } from '../project/links'
import type { ExportSource } from './prepare'
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
