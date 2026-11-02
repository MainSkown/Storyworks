import type { Calendar } from '../calendar'
import type { Link } from '../project/links'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { CodexEntry } from '../project/schemas/codexEntry'
import type { Scene } from '../project/schemas/scene'
import type { Timeline } from '../timeline/schema'
import { buildAppendices, type AppendixInput } from './appendices'
import { buildExportModel, ExportError } from './build'
import type { ExportDoc } from './model'
import type { ExportOptions } from './options'

/** Everything export reads from the open project, behind plain functions so it can be tested. */
export interface ExportSource {
  meta: ExportDoc['meta']
  manuscript: ManuscriptNode[]
  loadScene(path: string): Promise<{ ok: true; value: Scene } | { ok: false; message: string }>
  readAsset(path: string): Promise<Uint8Array | null>
  entries: CodexEntry[]
  links: Link[]
  timelines: Timeline[]
  calendar: Calendar
  appendixTexts: Pick<AppendixInput, 'titles' | 'labels'>
}

function imagePaths(node: unknown, out: Set<string>) {
  if (typeof node !== 'object' || node === null) return
  const n = node as { type?: string; attrs?: { src?: unknown }; content?: unknown }
  if (n.type === 'image' && typeof n.attrs?.src === 'string') out.add(n.attrs.src)
  if (Array.isArray(n.content)) for (const c of n.content) imagePaths(c, out)
}

function chapterScenes(nodes: ManuscriptNode[], selected: Set<string>): ManuscriptNode[] {
  return nodes.flatMap((n) =>
    n.type === 'part'
      ? chapterScenes(n.children, selected)
      : n.type === 'chapter' && selected.has(n.id)
        ? n.children.filter((c) => c.type === 'scene')
        : [],
  )
}

/** Loads the selected scenes and their images, then builds the format-neutral document (with appendices). */
export async function prepareExport(
  source: ExportSource,
  selectedChapterIds: string[],
  options: ExportOptions,
): Promise<ExportDoc> {
  const sceneNodes = chapterScenes(source.manuscript, new Set(selectedChapterIds))
  const scenes: Record<string, Scene> = {}
  const paths = new Set<string>()
  for (const sn of sceneNodes) {
    const r = sn.path ? await source.loadScene(sn.path) : null
    if (!r || !r.ok) throw new ExportError('sceneUnreadable', sn.title)
    scenes[sn.id] = r.value
    imagePaths(r.value.content, paths)
  }
  const assets = new Map<string, Uint8Array | null>()
  for (const p of paths) assets.set(p, await source.readAsset(p))

  const doc = buildExportModel(
    {
      meta: source.meta,
      manuscript: source.manuscript,
      scenes,
      readAsset: (p) => assets.get(p) ?? null,
      selectedChapterIds,
    },
    options,
  )
  doc.appendices = buildAppendices(
    {
      entries: source.entries,
      manuscript: source.manuscript,
      links: source.links,
      timelines: source.timelines,
      calendar: source.calendar,
      language: source.meta.language,
      ...source.appendixTexts,
    },
    options,
    doc.chapters,
  )
  return doc
}
