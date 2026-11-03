import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { labelsFor, LINES_PER_PAGE, LINE_WIDTH, paginate, wrapLines, type Page } from '../editor/screenplay/layout'
import { toBase64, type FontFiles } from './pdf'
import type { ScriptExporter } from './registry'
import { flatElements, type ScriptDoc } from './scriptModel'

// Standard page: Courier-metric 12 pt, 10 characters and 6 rows per inch, so a character is 7.2 pt
// wide and a row 12 pt high. Every line is placed absolutely, so the PDF has exactly our pages.
const CHAR = 7.2
const ROW = 12
const LEFT = 108 // 1.5 in
const TOP = 72
const PAGE_PT = { Letter: { name: 'LETTER', w: 612 }, A4: { name: 'A4', w: 595.28 } } as const
const NUMBER_GAP = 2 * CHAR

export type MonoFontLoader = () => Promise<FontFiles>

const fontUrls = import.meta.glob('./fonts/LiberationMono-*.ttf', { query: '?url', import: 'default' }) as Record<
  string,
  () => Promise<string>
>

/** App default: Liberation Mono (metric-compatible with Courier New), fetched on first export. */
export const loadMonoFonts: MonoFontLoader = async () => {
  const get = async (style: string) => {
    const res = await fetch(await fontUrls[`./fonts/LiberationMono-${style}.ttf`]!())
    if (!res.ok) throw new Error(`Could not load font LiberationMono-${style}`)
    return new Uint8Array(await res.arrayBuffer())
  }
  const [normal, bold, italics, bolditalics] = await Promise.all(['Regular', 'Bold', 'Italic', 'BoldItalic'].map(get))
  return { normal: normal!, bold: bold!, italics: italics!, bolditalics: bolditalics! }
}

const WRITTEN_BY = { en: 'Written by', pl: 'Scenariusz:' }

/** The pages the PDF will have (without the title page); also the page count shown in the app. */
export const scriptPages = (doc: ScriptDoc): Page[] =>
  paginate(flatElements(doc), {
    pageSize: doc.options.pageSize,
    labels: doc.options.moreContd ? labelsFor(doc.meta.language) : null,
  })

const line = (text: string, x: number, row: number | { y: number }): Content =>
  ({
    text,
    noWrap: true,
    absolutePosition: { x, y: typeof row === 'number' ? TOP + row * ROW : row.y },
  }) as Content

function titlePageNodes(doc: ScriptDoc): Content[] {
  const rows = LINES_PER_PAGE[doc.options.pageSize]
  const centred = (text: string, row: number) => line(text, LEFT + (LINE_WIDTH * CHAR - text.length * CHAR) / 2, row)
  const out: Content[] = []
  let row = Math.floor(rows / 3)
  for (const t of wrapLines(doc.meta.title.toUpperCase(), LINE_WIDTH)) out.push(centred(t, row++))
  row += 2
  if (doc.meta.author) {
    out.push(centred(doc.meta.language.toLowerCase().startsWith('pl') ? WRITTEN_BY.pl : WRITTEN_BY.en, row))
    row += 2
    for (const t of wrapLines(doc.meta.author, LINE_WIDTH)) out.push(centred(t, row++))
  }
  const contact = doc.titlePage.contact.split('\n').filter((l) => l.trim())
  contact.forEach((t, i) => out.push(line(t, LEFT, rows - contact.length + i)))
  const date = doc.titlePage.date.trim()
  if (date) out.push(line(date, LEFT + LINE_WIDTH * CHAR - date.length * CHAR, rows - 1))
  return out
}

export function toScriptDocDefinition(doc: ScriptDoc, pages: Page[]): TDocumentDefinitions {
  const o = doc.options
  const content: Content[] = []
  const pageBreak = () => content.push({ text: '', fontSize: 1, pageBreak: 'before' } as Content)
  if (o.titlePage) content.push(...titlePageNodes(doc))
  pages.forEach((page, i) => {
    if (i > 0 || o.titlePage) pageBreak()
    if (o.pageNumbers && i > 0) {
      const t = `${i + 1}.`
      content.push(line(t, LEFT + LINE_WIDTH * CHAR - t.length * CHAR, { y: TOP - 3 * ROW }))
    }
    for (const l of page.lines) {
      const x = LEFT + l.indent * CHAR
      content.push(line(l.text, x, l.row))
      if (l.number !== undefined) {
        const n = String(l.number)
        content.push(line(n, LEFT - NUMBER_GAP - n.length * CHAR, l.row))
        content.push(line(n, LEFT + LINE_WIDTH * CHAR + NUMBER_GAP, l.row))
      }
    }
  })
  if (!content.length) content.push({ text: ' ' })
  return {
    pageSize: { width: PAGE_PT[o.pageSize].w, height: o.pageSize === 'A4' ? 841.89 : 792 },
    pageMargins: [0, 0, 0, 0],
    defaultStyle: { font: 'Mono', fontSize: 12, lineHeight: 1 },
    info: { title: doc.meta.title, author: doc.meta.author },
    content,
  }
}

export interface PdfScriptConfig {
  loadFonts?: MonoFontLoader
}

export function createPdfScriptExporter(config: PdfScriptConfig = {}): ScriptExporter {
  const loadFonts = config.loadFonts ?? loadMonoFonts
  return {
    id: 'pdf-script',
    labelKey: 'export.formats.pdf',
    extension: 'pdf',
    mime: 'application/pdf',
    kinds: ['screenplay'],
    model: 'script',
    async export(doc) {
      const fonts = await loadFonts()
      const def = toScriptDocDefinition(doc, scriptPages(doc))
      // Lazy: pdfmake stays out of the editor bundle.
      const mod = await import('pdfmake/build/pdfmake')
      const pm = (mod as unknown as { default?: typeof mod }).default ?? mod
      const files = {
        normal: 'LiberationMono-Regular.ttf',
        bold: 'LiberationMono-Bold.ttf',
        italics: 'LiberationMono-Italic.ttf',
        bolditalics: 'LiberationMono-BoldItalic.ttf',
      }
      pm.addVirtualFileSystem({
        [files.normal]: toBase64(fonts.normal),
        [files.bold]: toBase64(fonts.bold),
        [files.italics]: toBase64(fonts.italics),
        [files.bolditalics]: toBase64(fonts.bolditalics),
      })
      pm.setFonts({ Mono: files })
      return new Uint8Array(await pm.createPdf(def).getBuffer())
    },
  }
}

export const pdfScriptExporter: ScriptExporter = createPdfScriptExporter()
