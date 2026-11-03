import { linkLabel } from '../gamedoc/linkLabels'
import type { MechanicStatus } from '../project/schemas/mechanic'
import { richTextBlocks } from './build'
import type { GameSource } from './gameDoc'
import type { ExportBlock, ExportChapter, ExportDoc, ExportFootnote, ExportWarning, Run } from './model'
import { defaultExportOptions, type ExportOptions } from './options'

/** Which sections of the game document go into the readable export. */
export interface GameDocumentOptions {
  overview: boolean
  mechanics: boolean
  glossary: boolean
}

export const defaultGameDocumentOptions = (): GameDocumentOptions => ({ overview: true, mechanics: true, glossary: true })

/** Words printed in the document (the caller passes translated text). */
export interface GameDocumentTexts {
  overview: string
  glossary: string
  /** Chapter for mechanics whose category no longer exists. */
  uncategorized: string
  untitled: string
  /** Printed for a link whose target is gone. */
  missing: string
  status: Record<MechanicStatus, string>
  tags: string
  parameters: string
  links: string
}

/** Builds the texts from a vue-i18n `t` (keys under export.gameDoc). */
export const gameDocumentTexts = (t: (key: string) => string): GameDocumentTexts => ({
  overview: t('export.gameDoc.overview'),
  glossary: t('export.gameDoc.glossary'),
  uncategorized: t('export.gameDoc.uncategorized'),
  untitled: t('export.gameDoc.untitled'),
  missing: t('export.gameDoc.missing'),
  status: {
    idea: t('export.gameDoc.status.idea'),
    designed: t('export.gameDoc.status.designed'),
    implemented: t('export.gameDoc.status.implemented'),
    cut: t('export.gameDoc.status.cut'),
  },
  tags: t('export.gameDoc.tags'),
  parameters: t('export.gameDoc.parameters'),
  links: t('export.gameDoc.links'),
})

type Source = Pick<GameSource, 'meta' | 'overview' | 'categories' | 'mechanics' | 'glossary' | 'linkNames'>

const para = (runs: Run[]): ExportBlock => ({ type: 'paragraph', runs, align: 'left' })
const text = (s: string): Run[] => [{ text: s }]
const list = (items: Run[][]): ExportBlock => ({ type: 'list', ordered: false, items, levels: items.map(() => 0) })

/** Headings in a description sit below the mechanic title (level 2). */
const demote = (b: ExportBlock): ExportBlock =>
  b.type === 'heading' ? { ...b, level: 3 } : b

export function buildGameDocument(
  src: Source,
  options: GameDocumentOptions,
  t: GameDocumentTexts,
  exportOptions: ExportOptions = defaultExportOptions(),
): ExportDoc {
  const warnings: ExportWarning[] = []
  const chapters: ExportChapter[] = []
  const add = (id: string, title: string, blocks: ExportBlock[], footnotes: ExportFootnote[] = []) => {
    if (blocks.length) chapters.push({ id, title, blocks, footnotes })
  }

  if (options.overview && src.overview) {
    const footnotes: ExportFootnote[] = []
    add('game-overview', t.overview, richTextBlocks(src.overview, warnings, footnotes), footnotes)
  }

  if (options.mechanics) {
    const known = new Set(src.categories.map((c) => c.id))
    const groups = [
      ...src.categories.map((c) => ({ id: c.id, name: c.name, items: src.mechanics.filter((m) => m.categoryId === c.id) })),
      { id: 'none', name: t.uncategorized, items: src.mechanics.filter((m) => !known.has(m.categoryId)) },
    ]
    for (const g of groups) {
      const footnotes: ExportFootnote[] = []
      const blocks: ExportBlock[] = []
      for (const m of g.items) {
        blocks.push({ type: 'heading', level: 2, runs: text(m.title.trim() || t.untitled), align: 'left' })
        const meta: Run[] = [{ text: t.status[m.status], italic: true }]
        if (m.tags.length) meta.push({ text: ` · ${t.tags}: ${m.tags.join(', ')}` })
        blocks.push(para(meta))
        if (m.summary.trim()) blocks.push(para(text(m.summary.trim())))
        blocks.push(...richTextBlocks(m.description, warnings, footnotes).map(demote))
        if (m.parameters.length) {
          blocks.push(para([{ text: t.parameters, bold: true }]))
          blocks.push(list(m.parameters.map((p) => text(`${p.name}: ${p.value}`))))
        }
        if (m.links.length) {
          blocks.push(para([{ text: t.links, bold: true }]))
          const fallback = { missing: t.missing, untitled: t.untitled }
          blocks.push(list(m.links.map((l) => text(linkLabel(l, src.linkNames, fallback)))))
        }
      }
      add(`game-category-${g.id}`, g.name, blocks, footnotes)
    }
  }

  if (options.glossary) {
    const sorted = [...src.glossary].sort((a, b) => a.term.localeCompare(b.term, src.meta.language || undefined))
    add(
      'game-glossary',
      t.glossary,
      sorted.map((g) => para([{ text: g.term, bold: true }, { text: `: ${g.definition}` }])),
    )
  }

  return { meta: src.meta, options: exportOptions, chapters, appendices: [], warnings }
}
