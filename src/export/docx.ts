import {
  AlignmentType,
  Document,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  SectionType,
  TableOfContents,
  TextRun,
  VerticalAlign,
  convertMillimetersToTwip,
  type ILevelsOptions,
  type ISectionOptions,
} from 'docx'
import { imageInfo } from './imageSize'
import type { Align, ExportBlock, ExportDoc, Run } from './model'
import type { ExportOptions, PageSize } from './options'
import type { Exporter } from './registry'

type Child = ISectionOptions['children'][number]
type Footnotes = Record<number, { children: Paragraph[] }>
type NumberingConfig = { reference: string; levels: ILevelsOptions[] }

const PAGE_MM: Record<PageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  Letter: { w: 215.9, h: 279.4 },
}
const FONTS = { serif: 'Times New Roman', sans: 'Arial' } as const
const ALIGN: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.BOTH,
}
const HEADINGS = [HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4] as const
// Characters XML 1.0 forbids; they would corrupt the file.
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g
const PX_PER_MM = 96 / 25.4

/** Holds the state shared while one document is rendered. */
class Ctx {
  footnotes: Footnotes = {}
  numbering: NumberingConfig[] = [{ reference: 'bullets', levels: levels(false) }]
  private nextFootnote = 1
  private nextList = 1
  constructor(readonly opts: ExportOptions) {}

  newFootnoteId = () => this.nextFootnote++
  newOrderedRef(): string {
    const reference = `ordered-${this.nextList++}`
    this.numbering.push({ reference, levels: levels(true) })
    return reference
  }
  get textWidthPx(): number {
    const { w } = PAGE_MM[this.opts.pageSize]
    return Math.max(50, (w - this.opts.marginMm.left - this.opts.marginMm.right) * PX_PER_MM)
  }
  get textHeightPx(): number {
    const { h } = PAGE_MM[this.opts.pageSize]
    return Math.max(50, (h - this.opts.marginMm.top - this.opts.marginMm.bottom) * PX_PER_MM)
  }
}

function levels(ordered: boolean): ILevelsOptions[] {
  const ordFormats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN]
  const bullets = ['•', '◦', '▪']
  return Array.from({ length: 9 }, (_, level) => ({
    level,
    format: ordered ? ordFormats[level % 3]! : LevelFormat.BULLET,
    text: ordered ? `%${level + 1}.` : bullets[level % 3]!,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }))
}

const clean = (s: string) => s.replace(ILLEGAL, '')

function textRuns(r: Extract<Run, { text: string }>): TextRun[] {
  const props = { bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined }
  return clean(r.text)
    .split('\n')
    .map((part, i) => new TextRun({ ...props, text: part, break: i > 0 ? 1 : undefined }))
}

function renderRuns(runs: Run[], notes?: Map<number, number>): (TextRun | FootnoteReferenceRun)[] {
  return runs.flatMap((r) => {
    if ('footnote' in r) {
      const id = notes?.get(r.footnote)
      return id === undefined ? [] : [new FootnoteReferenceRun(id)]
    }
    return textRuns(r)
  })
}

function renderImage(b: Extract<ExportBlock, { type: 'image' }>, ctx: Ctx): Paragraph {
  const info = b.bytes ? imageInfo(b.bytes) : null
  const type = info?.type
  if (!b.bytes || !info || !(type === 'png' || type === 'jpeg' || type === 'gif')) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: clean(`[missing image: ${b.path}]`), italics: true })],
    })
  }
  const maxW = Math.min(ctx.textWidthPx, b.width && b.width > 0 ? b.width : Infinity)
  let w: number
  let h: number
  if (info.width > 0 && info.height > 0) {
    const scale = Math.min(maxW / info.width, ctx.textHeightPx / info.height)
    w = info.width * scale
    h = info.height * scale
  } else {
    w = h = Math.min(maxW, ctx.textHeightPx)
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: false,
    children: [
      new ImageRun({
        type: type === 'jpeg' ? 'jpg' : type,
        data: b.bytes,
        transformation: { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) },
      }),
    ],
  })
}

function renderBlock(b: ExportBlock, ctx: Ctx, notes?: Map<number, number>): Child[] {
  switch (b.type) {
    case 'paragraph':
      return [new Paragraph({ alignment: ALIGN[b.align], children: renderRuns(b.runs, notes) })]
    case 'heading':
      return [
        new Paragraph({
          heading: HEADINGS[b.level - 1],
          alignment: ALIGN[b.align],
          children: renderRuns(b.runs, notes),
        }),
      ]
    case 'quote':
      return b.paragraphs.map(
        (runs) =>
          new Paragraph({
            alignment: ALIGN[b.align],
            indent: { left: 720, right: 720 },
            children: renderRuns(runs, notes),
          }),
      )
    case 'list': {
      const reference = b.ordered ? ctx.newOrderedRef() : 'bullets'
      return b.items.map(
        (runs, i) =>
          new Paragraph({
            numbering: { reference, level: Math.min(8, Math.max(0, b.levels[i] ?? 0)) },
            children: renderRuns(runs, notes),
          }),
      )
    }
    case 'sceneBreak':
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
          children: [new TextRun('* * *')],
        }),
      ]
    case 'image':
      return [renderImage(b, ctx)]
  }
}

const h1 = (
  title: string,
  extra: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    ...extra,
    children: [new TextRun(clean(title))],
  })

export const docxExporter: Exporter = {
  id: 'docx',
  labelKey: 'export.formats.docx',
  extension: 'docx',
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  kinds: ['book'],
  async export(doc: ExportDoc): Promise<Uint8Array> {
    const o = doc.options
    const ctx = new Ctx(o)
    const font = FONTS[o.font]
    const size = Math.round(o.fontSizePt * 2)
    const page = {
      size: {
        width: convertMillimetersToTwip(PAGE_MM[o.pageSize].w),
        height: convertMillimetersToTwip(PAGE_MM[o.pageSize].h),
      },
      margin: {
        top: convertMillimetersToTwip(o.marginMm.top),
        bottom: convertMillimetersToTwip(o.marginMm.bottom),
        left: convertMillimetersToTwip(o.marginMm.left),
        right: convertMillimetersToTwip(o.marginMm.right),
      },
    }

    const sections: ISectionOptions[] = []
    let numbered = false // page numbering restarts at 1 on the first section after the title page
    const addSection = (headerText: string | null, children: Child[]) => {
      sections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
          page: { ...page, ...(numbered ? {} : { pageNumbers: { start: 1 } }) },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: headerText
                  ? [new TextRun({ text: clean(headerText), italics: true })]
                  : [],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: o.pageNumbers ? [new TextRun({ children: [PageNumber.CURRENT] })] : [],
              }),
            ],
          }),
        },
        children,
      })
      numbered = true
    }
    const headerFor = (title: string) =>
      o.runningHeader === 'book' ? doc.meta.title : o.runningHeader === 'chapter' ? title : null

    if (o.titlePage) {
      sections.push({
        properties: { page: { ...page }, verticalAlign: VerticalAlign.CENTER },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
            children: [new TextRun({ text: clean(doc.meta.title), bold: true, size: size * 2.6 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: clean(doc.meta.author), size: size * 1.4 })],
          }),
        ],
      })
    }

    if (o.toc) {
      addSection(headerFor(doc.meta.title), [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 360 },
          children: [
            new TextRun({
              text: doc.meta.language.startsWith('pl') ? 'Spis treści' : 'Contents',
              bold: true,
              size: size * 1.6,
            }),
          ],
        }),
        new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-1' }),
      ])
    }

    for (const ch of doc.chapters) {
      const notes = new Map<number, number>()
      const children: Child[] = []
      if (ch.partTitle) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 4000 },
            children: [new TextRun({ text: clean(ch.partTitle), bold: true, size: size * 2.4 })],
          }),
          new Paragraph({
            pageBreakBefore: true,
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun(clean(ch.title))],
          }),
        )
      } else {
        children.push(h1(ch.title))
      }
      for (const fn of ch.footnotes) {
        const id = ctx.newFootnoteId()
        notes.set(fn.n, id)
        ctx.footnotes[id] = { children: [new Paragraph({ children: renderRuns(fn.runs) })] }
      }
      for (const b of ch.blocks) children.push(...renderBlock(b, ctx, notes))
      addSection(headerFor(ch.title), children)
    }

    for (const ap of doc.appendices) {
      const children: Child[] = [h1(ap.title)]
      for (const b of ap.blocks) children.push(...renderBlock(b, ctx))
      addSection(headerFor(ap.title), children)
    }

    if (sections.length === 0)
      sections.push({ properties: { page }, children: [new Paragraph('')] })

    const heading = (scale: number) => ({
      run: { font, bold: true, size: Math.round(size * scale), color: '000000' },
      paragraph: { spacing: { before: 240, after: 160 }, keepNext: true },
    })
    const document = new Document({
      title: clean(doc.meta.title),
      creator: clean(doc.meta.author),
      features: { updateFields: true },
      footnotes: ctx.footnotes,
      numbering: { config: ctx.numbering },
      styles: {
        default: {
          document: {
            run: { font, size, language: { value: doc.meta.language || 'en' } },
            paragraph: { spacing: { line: Math.round(240 * o.lineSpacing), after: 120 } },
          },
          heading1: {
            ...heading(1.8),
            paragraph: { spacing: { before: 0, after: 360 }, keepNext: true },
          },
          heading2: heading(1.4),
          heading3: heading(1.2),
          heading4: heading(1.1),
        },
      },
      sections,
    })
    return new Uint8Array(await Packer.toArrayBuffer(document))
  },
}
