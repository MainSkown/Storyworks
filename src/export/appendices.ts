import { orderPassages } from '../codex/appearsIn'
import { compareDates, formatDate, type Calendar } from '../calendar'
import type { Link } from '../project/links'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { CodexEntry } from '../project/schemas/codexEntry'
import type { Timeline } from '../timeline/schema'
import { compare, type OrderContext } from '../timeline/order'
import type { ExportAppendix, ExportBlock, ExportChapter, Run } from './model'
import type { ExportOptions } from './options'

export interface AppendixInput {
  entries: CodexEntry[]
  /** Manuscript tree (chapters hold their scenes); used to find which chapter a linked scene is in. */
  manuscript: ManuscriptNode[]
  /** All scene links of the book (codex links are picked out here). */
  links: Link[]
  timelines: Timeline[]
  calendar: Calendar
  /** Book language, used to sort names. */
  language: string
  /** Already translated headings. */
  titles: { personae: string; glossary: string; chronology: string }
  labels: { firstAppearance: string }
}

const para = (runs: Run[]): ExportBlock => ({ type: 'paragraph', runs, align: 'left' })

/** Entry id -> title of the first exported chapter with a scene linked to it. */
function firstAppearances(input: AppendixInput, chapters: ExportChapter[]): Map<string, string> {
  const chapterOfScene = new Map<string, string>()
  const sceneOrder: string[] = []
  const byId = new Map<string, ManuscriptNode>()
  const index = (nodes: ManuscriptNode[]) => {
    for (const nd of nodes) {
      byId.set(nd.id, nd)
      index(nd.children)
    }
  }
  index(input.manuscript)
  for (const ch of chapters) {
    for (const s of byId.get(ch.id)?.children ?? []) {
      if (s.type !== 'scene') continue
      chapterOfScene.set(s.id, ch.title)
      sceneOrder.push(s.id)
    }
  }
  const links = input.links.filter((l) => chapterOfScene.has(l.from.item))
  const out = new Map<string, string>()
  for (const e of input.entries) {
    const first = orderPassages(links, e.id, sceneOrder, new Map())[0]
    if (first) out.set(e.id, chapterOfScene.get(first.from.item) as string)
  }
  return out
}

function entryBlocks(
  entries: CodexEntry[],
  appearances: Map<string, string>,
  input: AppendixInput,
): ExportBlock[] {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name, input.language))
  const blocks: ExportBlock[] = []
  for (const e of sorted) {
    const head: Run[] = [{ text: e.name, bold: true }]
    if (e.aliases.length) head.push({ text: ` (${e.aliases.join(', ')})`, italic: true })
    blocks.push(para(head))
    if (e.appendixText.trim()) blocks.push(para([{ text: e.appendixText }]))
    const where = appearances.get(e.id)
    if (where !== undefined)
      blocks.push(para([{ text: `${input.labels.firstAppearance}: ${where}` }]))
  }
  return blocks
}

function chronologyBlocks(tl: Timeline, input: AppendixInput): ExportBlock[] {
  const cal = input.calendar
  const ctx: OrderContext = {
    calendar: cal,
    timeline: (id) => input.timelines.find((t) => t.id === id),
  }
  const at = (id: string) => ({ node: { timelineId: tl.id, nodeId: id } })
  // Only nodes whose date the calendar can order are sorted; the rest keep their original order.
  const dated = tl.nodes.filter((nd) => nd.date && compareDates(cal, nd.date, nd.date) !== null)
  const rest = tl.nodes.filter((nd) => !dated.includes(nd))
  dated.sort((a, b) => {
    const o = compare(at(a.id), at(b.id), ctx)
    return o === 'before' ? -1 : o === 'after' ? 1 : 0
  })
  const items = [...dated, ...rest].map((nd): Run[] => [
    { text: `${nd.date && dated.includes(nd) ? formatDate(cal, nd.date) : '—'} — ${nd.title}` },
  ])
  return items.length ? [{ type: 'list', ordered: false, items, levels: items.map(() => 0) }] : []
}

/**
 * Appendices for the export, in the order personae, glossary, chronology. Toggled-off and empty
 * ones are left out. `chapters` are the exported chapters (manuscript chapter ids).
 */
export function buildAppendices(
  input: AppendixInput,
  options: ExportOptions,
  chapters: ExportChapter[],
): ExportAppendix[] {
  const { personae, glossary, chronology } = options.appendices
  const out: ExportAppendix[] = []
  const appearances = firstAppearances(input, chapters)

  const eligible = (typeIds: string[]) =>
    input.entries.filter((e) => e.includeInAppendices && typeIds.includes(e.typeId))
  const add = (kind: 'personae' | 'glossary', blocks: ExportBlock[]) => {
    if (blocks.length) out.push({ kind, title: input.titles[kind], blocks })
  }

  if (personae.on) add('personae', entryBlocks(eligible(personae.typeIds), appearances, input))
  if (glossary.on) {
    const taken = personae.on ? personae.typeIds : []
    add(
      'glossary',
      entryBlocks(eligible(glossary.typeIds.filter((t) => !taken.includes(t))), appearances, input),
    )
  }
  if (chronology.on) {
    const tl = input.timelines.find((t) => t.id === chronology.timelineId)
    const blocks = tl ? chronologyBlocks(tl, input) : []
    if (blocks.length) out.push({ kind: 'chronology', title: input.titles.chronology, blocks })
  }
  return out
}
