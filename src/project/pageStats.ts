import { labelsFor, LINES_PER_PAGE, paginate, type ScriptElement, type ScriptPageSize } from '../editor/screenplay/layout'
import type { ManuscriptNode } from './schemas/manifest'

export interface PageStats {
  pages: number
  /** Estimated running time: about one minute per page, the last page counted by how full it is. */
  minutes: number
}

export interface PageStatsOptions {
  pageSize: ScriptPageSize
  language: string
  moreContd: boolean
}

/** Pages and runtime of the whole script, laid out exactly as the PDF export does (title page excluded). */
export function scriptPageStats(
  tree: ManuscriptNode[],
  elementsOf: (sceneId: string) => ScriptElement[] | undefined,
  opts: PageStatsOptions,
): PageStats {
  const flat: ScriptElement[] = []
  const walk = (n: ManuscriptNode) => {
    if (n.type === 'scene') flat.push(...(elementsOf(n.id) ?? []))
    else n.children.forEach(walk)
  }
  tree.forEach(walk)
  const pages = paginate(flat, {
    pageSize: opts.pageSize,
    labels: opts.moreContd ? labelsFor(opts.language) : null,
  })
  if (!pages.length) return { pages: 0, minutes: 0 }
  const last = pages[pages.length - 1]!
  const fill = (Math.max(...last.lines.map((l) => l.row)) + 1) / LINES_PER_PAGE[opts.pageSize]
  return { pages: pages.length, minutes: Math.round(pages.length - 1 + fill) }
}
