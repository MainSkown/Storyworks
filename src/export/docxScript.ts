import {
  AlignmentType,
  Document,
  Header,
  LineRuleType,
  PageNumber,
  Packer,
  Paragraph,
  SectionType,
  Tab,
  TabStopType,
  TextRun,
  type IParagraphStyleOptions,
  type ISectionOptions,
} from 'docx'
import {
  ELEMENT_LAYOUT,
  LINE_WIDTH,
  wrapLines,
  type ScriptPageSize,
} from '../editor/screenplay/layout'
import type { ElementType } from '../editor/screenplay/rules'
import { flatElements, type ScriptDoc } from './scriptModel'
import type { ScriptExporter } from './registry'

const FONT = 'Courier New'
const LINE = 240 // 12 pt, exact
const IN = 1440 // twips per inch
const CH = IN / 10 // one column at 10 characters per inch
const NUMBER_HANG = 864 // scene number sits 0.6" left of the text
const RIGHT_EDGE = 9360 // 6.5"
const TEXT_WIDTH = LINE_WIDTH * CH // 6.0"
const LEFT_MARGIN = Math.round(1.5 * IN)
const VERTICAL_MARGIN = IN

const PAGE: Record<ScriptPageSize, { w: number; h: number }> = {
  Letter: { w: 12240, h: 15840 },
  A4: { w: 11906, h: 16838 },
}

const STYLES: Record<ElementType, { id: string; name: string }> = {
  sceneHeading: { id: 'SceneHeading', name: 'Scene Heading' },
  action: { id: 'Action', name: 'Action' },
  character: { id: 'Character', name: 'Character' },
  dialogue: { id: 'Dialogue', name: 'Dialogue' },
  parenthetical: { id: 'Parenthetical', name: 'Parenthetical' },
  transition: { id: 'Transition', name: 'Transition' },
}
const KEEP_NEXT: ElementType[] = ['sceneHeading', 'character', 'parenthetical']

// eslint-disable-next-line no-control-regex
const ILLEGAL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g
const clean = (s: string) => s.replace(ILLEGAL, '')

const paragraphStyle = (type: ElementType): IParagraphStyleOptions => {
  const spec = ELEMENT_LAYOUT[type]
  return {
    id: STYLES[type].id,
    name: STYLES[type].name,
    quickFormat: true,
    run: { font: FONT, size: 24 },
    paragraph: {
      alignment: type === 'transition' ? AlignmentType.RIGHT : AlignmentType.LEFT,
      keepNext: KEEP_NEXT.includes(type),
      spacing: { before: spec.blank * LINE, after: 0, line: LINE, lineRule: LineRuleType.EXACT },
      indent: {
        left: spec.indent * CH,
        right: Math.max(0, TEXT_WIDTH - (spec.indent + spec.width) * CH),
      },
    },
  }
}

function textRuns(text: string): TextRun[] {
  return clean(text)
    .split('\n')
    .map((part, i) => new TextRun({ text: part, break: i > 0 ? 1 : undefined }))
}

function elementParagraph(
  type: ElementType,
  text: string,
  number: number | undefined,
  first: boolean,
): Paragraph {
  const spec = ELEMENT_LAYOUT[type]
  const shown = spec.upper ? text.toUpperCase() : text
  const spacing = first ? { before: 0 } : undefined // nothing above the first row
  if (type === 'sceneHeading' && number !== undefined) {
    const n = () => new TextRun({ text: String(number) })
    return new Paragraph({
      style: STYLES[type].id,
      spacing,
      indent: { left: spec.indent * CH, hanging: NUMBER_HANG },
      tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_EDGE }],
      children: [
        n(),
        new TextRun({ children: [new Tab()] }),
        ...textRuns(shown),
        new TextRun({ children: [new Tab()] }),
        n(),
      ],
    })
  }
  return new Paragraph({ style: STYLES[type].id, spacing, children: textRuns(shown) })
}

function titlePage(doc: ScriptDoc, height: number): Paragraph[] {
  const pl = doc.meta.language.toLowerCase().startsWith('pl')
  const title = clean(doc.meta.title).toUpperCase()
  const centered = (text: string, before = 0) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before, after: 0, line: LINE, lineRule: LineRuleType.EXACT },
      children: [new TextRun({ text, font: FONT, size: 24 })],
    })
  const titleBefore = Math.round((height - 2 * VERTICAL_MARGIN) / 3) - 2 * LINE
  const out = [
    centered(title, titleBefore),
    centered(pl ? 'Scenariusz:' : 'Written by', 2 * LINE),
    centered(clean(doc.meta.author), LINE),
  ]
  const contact = clean(doc.titlePage.contact)
    .split('\n')
    .filter((l) => l.trim())
  const date = clean(doc.titlePage.date).trim()
  const titleRows = wrapLines(title, LINE_WIDTH).length
  const used = titleBefore + (titleRows + 5) * LINE
  const bottom = contact.length + (date ? 2 : 0)
  // Push the contact block to the bottom, with two rows of slack so it never spills over.
  const gap = Math.max(LINE, height - 2 * VERTICAL_MARGIN - used - (bottom + 2) * LINE)
  contact.forEach((line, i) =>
    out.push(
      new Paragraph({
        spacing: { before: i === 0 ? gap : 0, after: 0, line: LINE, lineRule: LineRuleType.EXACT },
        children: [new TextRun({ text: line, font: FONT, size: 24 })],
      }),
    ),
  )
  if (date)
    out.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: {
          before: contact.length ? LINE : gap,
          after: 0,
          line: LINE,
          lineRule: LineRuleType.EXACT,
        },
        children: [new TextRun({ text: date, font: FONT, size: 24 })],
      }),
    )
  return out
}

export const docxScriptExporter: ScriptExporter = {
  id: 'docx-script',
  labelKey: 'export.formats.docx',
  extension: 'docx',
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  kinds: ['screenplay'],
  model: 'script',
  async export(doc: ScriptDoc): Promise<Uint8Array> {
    const o = doc.options
    const { w, h } = PAGE[o.pageSize]
    // Keep the text area at exactly 6.0" so columns match the PDF; A4 gets a narrower right margin.
    const margin = {
      top: VERTICAL_MARGIN,
      bottom: VERTICAL_MARGIN,
      left: LEFT_MARGIN,
      right: Math.max(IN / 2, w - LEFT_MARGIN - TEXT_WIDTH),
    }
    const size = { width: w, height: h }

    const body = flatElements(doc)
      .filter((el) => el.text.trim() !== '')
      .map((el, i) => elementParagraph(el.type, el.text, el.number, i === 0))
    if (body.length === 0) body.push(new Paragraph(''))

    const sections: ISectionOptions[] = []
    if (o.titlePage)
      sections.push({ properties: { page: { size, margin } }, children: titlePage(doc, h) })

    const numberHeader = new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ children: [PageNumber.CURRENT, '.'], font: FONT, size: 24 })],
        }),
      ],
    })
    sections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        titlePage: o.pageNumbers, // no number on the first page
        page: { size, margin, pageNumbers: { start: 1 } },
      },
      ...(o.pageNumbers
        ? {
            headers: {
              default: numberHeader,
              first: new Header({ children: [new Paragraph('')] }),
            },
          }
        : {}),
      children: body,
    })

    const document = new Document({
      title: clean(doc.meta.title),
      creator: clean(doc.meta.author),
      styles: {
        default: {
          document: {
            run: { font: FONT, size: 24, language: { value: doc.meta.language || 'en' } },
            paragraph: {
              spacing: { before: 0, after: 0, line: LINE, lineRule: LineRuleType.EXACT },
            },
          },
        },
        paragraphStyles: (Object.keys(STYLES) as ElementType[]).map(paragraphStyle),
      },
      sections,
    })
    return new Uint8Array(await Packer.toArrayBuffer(document))
  },
}
