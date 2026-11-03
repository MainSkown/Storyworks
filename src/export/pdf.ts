import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { imageInfo } from './imageSize'
import type { ExportBlock, ExportDoc, Run } from './model'
import type { FontFamily } from './options'
import type { BookExporter } from './registry'

export interface PdfLabels {
  contents: string
  notes: string
  /** `{path}` is replaced with the image path. */
  missingImage: string
  unsupportedImage: string
}

const LABELS: Record<'en' | 'pl', PdfLabels> = {
  en: {
    contents: 'Contents',
    notes: 'Notes',
    missingImage: '[missing image: {path}]',
    unsupportedImage: '[image format not supported in PDF: {path}]',
  },
  pl: {
    contents: 'Spis treści',
    notes: 'Przypisy',
    missingImage: '[brak obrazu: {path}]',
    unsupportedImage: '[format obrazu nieobsługiwany w PDF: {path}]',
  },
}

export type FontFiles = Record<'normal' | 'bold' | 'italics' | 'bolditalics', Uint8Array>
export type FontLoader = (family: FontFamily) => Promise<FontFiles>

const fontUrls = import.meta.glob('./fonts/*.ttf', { query: '?url', import: 'default' }) as Record<
  string,
  () => Promise<string>
>

/** App default: fonts are emitted as assets and fetched on first export. */
export const loadBundledFonts: FontLoader = async (family) => {
  const name = family === 'sans' ? 'LiberationSans' : 'LiberationSerif'
  const get = async (style: string) => {
    const url = await fontUrls[`./fonts/${name}-${style}.ttf`]!()
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Could not load font ${name}-${style}`)
    return new Uint8Array(await res.arrayBuffer())
  }
  const [normal, bold, italics, bolditalics] = await Promise.all(
    ['Regular', 'Bold', 'Italic', 'BoldItalic'].map(get),
  )
  return { normal: normal!, bold: bold!, italics: italics!, bolditalics: bolditalics! }
}

export interface DocDefinitionOptions {
  labels?: Partial<PdfLabels>
  /** Physical start page of each section (chapter, part page, appendix) from a first pass. */
  sectionPages?: number[]
  /** First pass: called with each section's final physical start page. */
  onSectionPage?: (index: number, page: number) => void
}

const MM = 72 / 25.4
const PAGE_PT = {
  A4: { name: 'A4', w: 595.28, h: 841.89 },
  A5: { name: 'A5', w: 419.53, h: 595.28 },
  Letter: { name: 'LETTER', w: 612, h: 792 },
} as const

// eslint-disable-next-line no-control-regex
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

export function toBase64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

type Node = Record<string, unknown>

export function toDocDefinition(doc: ExportDoc, opts: DocDefinitionOptions = {}): TDocumentDefinitions {
  const o = doc.options
  const labels: PdfLabels = {
    ...(doc.meta.language.toLowerCase().startsWith('pl') ? LABELS.pl : LABELS.en),
    ...opts.labels,
  }
  const fs = o.fontSizePt
  const page = PAGE_PT[o.pageSize]
  const m = {
    left: o.marginMm.left * MM,
    top: o.marginMm.top * MM,
    right: o.marginMm.right * MM,
    bottom: o.marginMm.bottom * MM,
  }
  const textW = page.w - m.left - m.right
  const textH = page.h - m.top - m.bottom
  const gap = fs * 0.6

  const runNodes = (runs: Run[]): Node[] =>
    runs.map((r) =>
      'footnote' in r
        ? { text: String(r.footnote), sup: true }
        : {
            text: clean(r.text),
            ...(r.bold ? { bold: true } : {}),
            ...(r.italic ? { italics: true } : {}),
            ...(r.underline ? { decoration: 'underline' } : {}),
          },
    )
  const richText = (runs: Run[]) => (runs.length ? runNodes(runs) : ' ')

  function listNode(b: Extract<ExportBlock, { type: 'list' }>): Node {
    const lv: number[] = []
    b.items.forEach((_, k) => lv.push(k === 0 ? 0 : Math.min(Math.max(b.levels[k] ?? 0, 0), lv[k - 1]! + 1)))
    let i = 0
    const parse = (depth: number): Node => {
      const arr: Node[] = []
      while (i < b.items.length && lv[i]! >= depth) {
        const text: Node = { text: richText(b.items[i]!) }
        i++
        arr.push(i < b.items.length && lv[i]! > depth ? { stack: [text, parse(depth + 1)] } : text)
      }
      return b.ordered ? { ol: arr } : { ul: arr }
    }
    return { ...parse(0), margin: [0, 0, 0, gap] }
  }

  function imageNode(b: Extract<ExportBlock, { type: 'image' }>): Node {
    const placeholder = (label: string): Node => ({
      text: label.replace('{path}', clean(b.path)),
      italics: true,
      alignment: 'center',
      margin: [0, gap, 0, gap],
    })
    if (!b.bytes) return placeholder(labels.missingImage)
    const info = imageInfo(b.bytes)
    if (!info || (info.type !== 'png' && info.type !== 'jpeg')) return placeholder(labels.unsupportedImage)
    let w = (b.width ?? info.width) * 0.75
    if (!(w > 0)) w = textW
    w = Math.min(w, textW)
    const node: Node = {
      image: `data:image/${info.type};base64,${toBase64(b.bytes)}`,
      alignment: 'center',
      margin: [0, gap, 0, gap],
    }
    if (info.width > 0 && info.height > 0) {
      let h = (w * info.height) / info.width
      if (h > textH) {
        h = textH
        w = (h * info.width) / info.height
      }
      return { ...node, width: w, height: h }
    }
    return { ...node, width: w }
  }

  const headingScale = { 1: 1.6, 2: 1.35, 3: 1.15 } as const
  function blockNodes(b: ExportBlock): Node[] {
    switch (b.type) {
      case 'paragraph':
        return [{ text: richText(b.runs), alignment: b.align, margin: [0, 0, 0, gap] }]
      case 'heading':
        return [
          {
            text: richText(b.runs),
            bold: true,
            fontSize: fs * headingScale[b.level],
            alignment: b.align,
            margin: [0, fs, 0, fs * 0.5],
          },
        ]
      case 'quote':
        return b.paragraphs.map((p) => ({
          text: richText(p),
          alignment: b.align,
          margin: [fs * 2.5, 0, fs * 2.5, gap],
        }))
      case 'list':
        return [listNode(b)]
      case 'sceneBreak':
        return [{ text: '* * *', alignment: 'center', margin: [0, fs, 0, fs] }]
      case 'image':
        return [imageNode(b)]
    }
  }

  const out: Node[] = []
  const sections: string[] = [] // header title per section ('' = none)
  const toc: { title: string; section: number }[] = []
  const brk = () => {
    if (out.length) out.push({ text: '', pageBreak: 'before' })
  }
  const section = (title: string) => {
    sections.push(title)
    return `sec:${sections.length - 1}`
  }
  const sectionTitle = (title: string, inToc: boolean): Node => {
    const id = section(title)
    if (inToc) toc.push({ title, section: sections.length - 1 })
    return {
      text: clean(title),
      id,
      bold: true,
      fontSize: fs * 1.9,
      margin: [0, 0, 0, fs * 1.2],
      ...(inToc && !o.titlePage ? { tocItem: true } : {}),
    }
  }

  if (o.titlePage) {
    out.push(
      {
        text: clean(doc.meta.title),
        bold: true,
        fontSize: fs * 3,
        alignment: 'center',
        margin: [0, textH * 0.3, 0, fs * 2],
      },
      { text: clean(doc.meta.author), fontSize: fs * 1.5, alignment: 'center' },
    )
  }

  // Titles are collected first so the TOC can sit before them.
  const body: Node[] = []
  const pushBody = (...n: Node[]) => body.push(...n)
  for (const ch of doc.chapters) {
    if (ch.partTitle) {
      pushBody(
        { text: '', pageBreak: 'before' },
        {
          text: clean(ch.partTitle),
          id: section(''),
          bold: true,
          fontSize: fs * 2.6,
          alignment: 'center',
          margin: [0, textH * 0.35, 0, 0],
        },
      )
    }
    pushBody({ text: '', pageBreak: 'before' }, sectionTitle(ch.title, true))
    for (const b of ch.blocks) pushBody(...blockNodes(b))
    if (ch.footnotes.length) {
      pushBody({ text: labels.notes, bold: true, fontSize: fs * 0.95, margin: [0, fs * 1.5, 0, fs * 0.4] })
      for (const f of ch.footnotes)
        pushBody({ text: [{ text: `${f.n}. ` }, ...runNodes(f.runs)], fontSize: fs * 0.85, margin: [0, 0, 0, 2] })
    }
  }
  for (const ap of doc.appendices) {
    pushBody({ text: '', pageBreak: 'before' }, sectionTitle(ap.title, true))
    for (const b of ap.blocks) pushBody(...blockNodes(b))
  }

  if (o.toc && toc.length) {
    brk()
    const titleNode: Node = { text: labels.contents, bold: true, fontSize: fs * 1.9, margin: [0, 0, 0, fs * 1.2] }
    if (o.titlePage) {
      // pdfmake's own TOC shows physical pages; with a title page we shift them by one.
      out.push(titleNode)
      for (const e of toc) {
        const p = opts.sectionPages?.[e.section]
        out.push({
          columns: [
            { text: clean(e.title), width: '*' },
            { text: p === undefined ? '' : String(p - 1), width: 40, alignment: 'right' },
          ],
          margin: [0, 0, 0, 3],
        })
      }
    } else {
      out.push({ toc: { title: titleNode } })
    }
  }
  out.push(...body.slice(out.length ? 0 : 1)) // first page break is not needed on an empty document

  const shift = o.titlePage ? 1 : 0
  const furnitureX = [m.left, 0, m.right, 0]
  const def: TDocumentDefinitions = {
    pageSize: page.name,
    pageMargins: [m.left, m.top, m.right, m.bottom],
    defaultStyle: { font: 'Body', fontSize: fs, lineHeight: o.lineSpacing },
    info: { title: clean(doc.meta.title), author: clean(doc.meta.author) },
    content: out as unknown as Content[],
  }

  if (o.runningHeader !== 'none') {
    const mk = (text: string) => ({
      text: clean(text),
      alignment: 'center',
      italics: true,
      fontSize: fs * 0.85,
      margin: [furnitureX[0]!, Math.max(m.top / 2 - fs * 0.5, 4), furnitureX[2]!, 0],
    })
    def.header = (current: number) => {
      if (current <= shift && o.titlePage) return null
      if (o.runningHeader === 'book') return mk(doc.meta.title) as Content
      const starts = opts.sectionPages
      if (!starts) return null
      let title = ''
      starts.forEach((start, i) => {
        if (start !== undefined && start <= current) title = sections[i] ?? ''
      })
      return title ? (mk(title) as Content) : null
    }
  }

  if (o.pageNumbers) {
    def.footer = (current: number) => {
      if (o.titlePage && current === 1) return null
      return {
        text: String(current - shift),
        alignment: 'center',
        fontSize: fs * 0.85,
        margin: [furnitureX[0]!, Math.max(m.bottom / 2 - fs * 0.5, 4), furnitureX[2]!, 0],
      } as Content
    }
  }

  if (opts.onSectionPage) {
    const record = opts.onSectionPage
    def.pageBreakBefore = (node) => {
      const id = typeof node.id === 'string' ? node.id : ''
      if (id.startsWith('sec:')) record(Number(id.slice(4)), node.startPosition.pageNumber)
      return false
    }
  }
  return def
}

const familyName = (f: FontFamily) => (f === 'sans' ? 'LiberationSans' : 'LiberationSerif')

async function render(def: TDocumentDefinitions, fonts: FontFiles, family: FontFamily): Promise<Uint8Array> {
  // Lazy: pdfmake stays out of the editor bundle.
  const mod = await import('pdfmake/build/pdfmake')
  const pm = (mod as unknown as { default?: typeof mod }).default ?? mod
  const base = familyName(family)
  const files = {
    normal: `${base}-Regular.ttf`,
    bold: `${base}-Bold.ttf`,
    italics: `${base}-Italic.ttf`,
    bolditalics: `${base}-BoldItalic.ttf`,
  }
  pm.addVirtualFileSystem({
    [files.normal]: toBase64(fonts.normal),
    [files.bold]: toBase64(fonts.bold),
    [files.italics]: toBase64(fonts.italics),
    [files.bolditalics]: toBase64(fonts.bolditalics),
  })
  pm.setFonts({ Body: files })
  return new Uint8Array(await pm.createPdf(def).getBuffer())
}

export interface PdfExporterConfig {
  loadFonts?: FontLoader
  labels?: Partial<PdfLabels>
}

export function createPdfExporter(config: PdfExporterConfig = {}): BookExporter {
  const loadFonts = config.loadFonts ?? loadBundledFonts
  return {
    id: 'pdf',
    labelKey: 'export.formats.pdf',
    extension: 'pdf',
    mime: 'application/pdf',
    kinds: ['book'],
    async export(doc) {
      const o = doc.options
      const fonts = await loadFonts(o.font)
      let sectionPages: number[] | undefined
      if ((o.titlePage && o.toc) || o.runningHeader === 'chapter') {
        const pages: number[] = []
        await render(
          toDocDefinition(doc, { labels: config.labels, onSectionPage: (i, p) => (pages[i] = p) }),
          fonts,
          o.font,
        )
        sectionPages = pages
      }
      return render(toDocDefinition(doc, { labels: config.labels, sectionPages }), fonts, o.font)
    },
  }
}

export const pdfExporter: BookExporter = createPdfExporter()
