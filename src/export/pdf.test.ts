import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultExportOptions, type ExportOptions } from './options'
import type { ExportBlock, ExportChapter, ExportDoc, Run } from './model'
import { createPdfExporter, pdfExporter, toDocDefinition, type FontLoader } from './pdf'

// RGB without alpha: pdfmake's browser build decodes alpha PNGs in a Worker, which node lacks.
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64',
  ),
)
// PNG header claiming 2000 x 1000 px
const BIG_PNG = (() => {
  const b = new Uint8Array(PNG)
  new DataView(b.buffer).setUint32(16, 2000)
  new DataView(b.buffer).setUint32(20, 1000)
  return b
})()

const t = (text: string, extra: Partial<Extract<Run, { text: string }>> = {}): Run => ({
  text,
  ...extra,
})
const para = (text: string, align: 'left' | 'justify' | 'right' = 'left'): ExportBlock => ({
  type: 'paragraph',
  runs: [t(text)],
  align,
})
const chapter = (id: string, extra: Partial<ExportChapter> = {}): ExportChapter => ({
  id,
  title: `Chapter ${id}`,
  blocks: [para(`Body of ${id}`)],
  footnotes: [],
  ...extra,
})
function mk(
  options: Partial<ExportOptions> = {},
  chapters = [chapter('a'), chapter('b')],
): ExportDoc {
  return {
    meta: { title: 'My Book', author: 'Jane Doe', language: 'en' },
    options: {
      ...defaultExportOptions(),
      titlePage: false,
      toc: false,
      pageNumbers: false,
      ...options,
    },
    chapters,
    appendices: [],
    warnings: [],
  }
}

type N = Record<string, unknown>
const flat = (n: unknown): N[] => {
  if (Array.isArray(n)) return n.flatMap(flat)
  if (n && typeof n === 'object') {
    const o = n as N
    return [o, ...['text', 'stack', 'ul', 'ol', 'columns'].flatMap((k) => flat(o[k]))]
  }
  return []
}
const content = (d: ReturnType<typeof toDocDefinition>) => flat(d.content)
const strings = (d: ReturnType<typeof toDocDefinition>) =>
  content(d).flatMap((n) => (typeof n.text === 'string' ? [n.text] : []))
const header = (d: ReturnType<typeof toDocDefinition>, page: number) =>
  (d.header as (p: number, n: number) => unknown)(page, 9)
const footer = (d: ReturnType<typeof toDocDefinition>, page: number) =>
  (d.footer as (p: number, n: number) => unknown)(page, 9)

describe('toDocDefinition: page setup', () => {
  it('maps page size, margins (mm to pt), font size and line spacing', () => {
    const d = toDocDefinition(
      mk({
        pageSize: 'A5',
        marginMm: { top: 10, bottom: 20, left: 30, right: 40 },
        fontSizePt: 12,
        lineSpacing: 1.5,
      }),
    )
    const pt = (mm: number) => (mm * 72) / 25.4
    expect(d.pageSize).toBe('A5')
    expect(d.pageMargins).toEqual([pt(30), pt(10), pt(40), pt(20)])
    expect(d.defaultStyle).toMatchObject({ fontSize: 12, lineHeight: 1.5 })
  })

  it('uses LETTER for Letter', () => {
    expect(toDocDefinition(mk({ pageSize: 'Letter' })).pageSize).toBe('LETTER')
  })

  it('carries block alignment', () => {
    const d = toDocDefinition(
      mk({}, [chapter('a', { blocks: [para('J', 'justify'), para('R', 'right')] })]),
    )
    const al = (s: string) =>
      content(d).find((n) => flat(n.text).some((x) => x.text === s))?.alignment
    expect(al('J')).toBe('justify')
    expect(al('R')).toBe('right')
  })

  it('strips control characters but keeps newlines', () => {
    const d = toDocDefinition(
      mk({}, [chapter('a', { blocks: [para('a\u0000b\u0008c\u001fd\ne')] })]),
    )
    expect(strings(d)).toContain('abcd\ne')
  })
})

describe('toDocDefinition: structure', () => {
  it('lists chapter titles as TOC items; part titles and in-scene headings are not', () => {
    const chapters = [
      chapter('a', {
        partTitle: 'Part One',
        blocks: [{ type: 'heading', level: 2, runs: [t('Inner')], align: 'left' }],
      }),
      chapter('b'),
    ]
    const d = toDocDefinition(mk({ toc: true }, chapters))
    const items = content(d)
      .filter((n) => n.tocItem)
      .map((n) => n.text)
    expect(items).toEqual(['Chapter a', 'Chapter b'])
    expect(content(d).some((n) => n.toc)).toBe(true)
    expect(strings(d)).toContain('Part One')
    expect(strings(d)).toContain('Inner')
  })

  it('has no TOC when switched off', () => {
    const d = toDocDefinition(mk({ toc: false }))
    expect(content(d).some((n) => n.toc)).toBe(false)
  })

  it('puts appendices in the TOC', () => {
    const doc = mk({ toc: true })
    doc.appendices = [{ kind: 'glossary', title: 'Glossary', blocks: [para('Word')] }]
    const d = toDocDefinition(doc)
    expect(
      content(d)
        .filter((n) => n.tocItem)
        .map((n) => n.text),
    ).toContain('Glossary')
    expect(strings(d)).toContain('Word')
  })

  it('builds a manual TOC with page numbers shifted by the title page', () => {
    const d = toDocDefinition(mk({ toc: true, titlePage: true }), { sectionPages: [3, 5] })
    expect(content(d).some((n) => n.toc)).toBe(false)
    const s = strings(d)
    expect(s).toContain('2')
    expect(s).toContain('4')
  })

  it('renders title page fields', () => {
    const d = toDocDefinition(mk({ titlePage: true }))
    expect(strings(d)).toEqual(expect.arrayContaining(['My Book', 'Jane Doe']))
    expect(d.info).toMatchObject({ title: 'My Book', author: 'Jane Doe' })
  })

  it('nests list levels', () => {
    const list: ExportBlock = {
      type: 'list',
      ordered: false,
      items: [[t('one')], [t('sub')], [t('two')]],
      levels: [0, 1, 0],
    }
    const d = toDocDefinition(mk({}, [chapter('a', { blocks: [list] })]))
    const top = content(d).find((n) => Array.isArray(n.ul))!
    const items = top.ul as unknown[]
    expect(items).toHaveLength(2)
    expect(flat(items[0]).some((n) => Array.isArray(n.ul))).toBe(true)
    expect(strings(d)).toEqual(expect.arrayContaining(['one', 'sub', 'two']))
  })
})

describe('toDocDefinition: footnotes', () => {
  const withNotes = chapter('a', {
    blocks: [
      { type: 'paragraph', runs: [t('Text'), { footnote: 1 }, { footnote: 2 }], align: 'left' },
    ],
    footnotes: [
      { n: 1, runs: [t('First note')] },
      { n: 2, runs: [t('Second note')] },
    ],
  })

  it('renders superscript refs and a numbered Notes list at chapter end', () => {
    const d = toDocDefinition(mk({}, [withNotes, chapter('b')]))
    const all = content(d)
    expect(all.filter((n) => n.sup).map((n) => n.text)).toEqual(['1', '2'])
    const s = strings(d)
    const i = s.indexOf('Notes')
    expect(i).toBeGreaterThan(-1)
    expect(s.slice(i)).toEqual(expect.arrayContaining(['1. ', 'First note', '2. ', 'Second note']))
    expect(s.indexOf('Notes')).toBeLessThan(s.indexOf('Chapter b'))
    expect(s.filter((x) => x === 'Notes')).toHaveLength(1)
  })

  it('uses the given label', () => {
    const d = toDocDefinition(mk({}, [withNotes]), { labels: { notes: 'Przypisy' } })
    expect(strings(d)).toContain('Przypisy')
  })
})

describe('toDocDefinition: running header and footer', () => {
  it('has no header when none', () => {
    expect(toDocDefinition(mk({ runningHeader: 'none' })).header).toBeUndefined()
  })

  it('shows the book title, not on the title page', () => {
    const d = toDocDefinition(mk({ runningHeader: 'book', titlePage: true }))
    expect(header(d, 1)).toBeFalsy()
    expect(JSON.stringify(header(d, 2))).toContain('My Book')
  })

  it('shows the chapter a page belongs to', () => {
    const d = toDocDefinition(mk({ runningHeader: 'chapter' }), { sectionPages: [1, 4] })
    expect(JSON.stringify(header(d, 3))).toContain('Chapter a')
    expect(JSON.stringify(header(d, 4))).toContain('Chapter b')
    expect(JSON.stringify(header(d, 9))).toContain('Chapter b')
  })

  it('has a footer only with page numbers', () => {
    expect(toDocDefinition(mk({ pageNumbers: false })).footer).toBeUndefined()
    expect(toDocDefinition(mk({ pageNumbers: true })).footer).toBeDefined()
  })

  it('starts numbering after the title page', () => {
    const d = toDocDefinition(mk({ pageNumbers: true, titlePage: true }))
    expect(footer(d, 1)).toBeFalsy()
    expect(JSON.stringify(footer(d, 2))).toContain('"1"')
    expect(JSON.stringify(footer(d, 5))).toContain('"4"')
  })

  it('numbers from the first page without a title page', () => {
    expect(JSON.stringify(footer(toDocDefinition(mk({ pageNumbers: true })), 1))).toContain('"1"')
  })
})

describe('toDocDefinition: images', () => {
  const img = (b: Partial<Extract<ExportBlock, { type: 'image' }>>): ExportBlock => ({
    type: 'image',
    bytes: PNG,
    path: 'assets/x.png',
    ...b,
  })
  const run = (b: ExportBlock) => toDocDefinition(mk({}, [chapter('a', { blocks: [b] })]))

  it('shows a placeholder for a missing image', () => {
    const d = run(img({ bytes: null }))
    const n = content(d).find((x) => String(x.text).includes('assets/x.png'))!
    expect(n.text).toBe('[missing image: assets/x.png]')
    expect(n.italics).toBe(true)
    expect(n.alignment).toBe('center')
  })

  it('embeds an image at its own size (px to pt)', () => {
    const d = run(img({ bytes: BIG_PNG, width: 100 }))
    const n = content(d).find((x) => typeof x.image === 'string')!
    expect(String(n.image)).toMatch(/^data:image\/png;base64,/)
    expect(n.width).toBeCloseTo(75)
  })

  it('caps width at the text width and keeps aspect', () => {
    const d = run(img({ bytes: BIG_PNG }))
    const n = content(d).find((x) => typeof x.image === 'string')!
    const textWidth = 595.28 - 2 * ((25 * 72) / 25.4)
    expect(n.width).toBeCloseTo(textWidth, 0)
    expect(n.height).toBeCloseTo(textWidth / 2, 0)
  })

  it('uses a placeholder for unsupported formats', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    const d = run(img({ bytes: svg, path: 'assets/a.svg' }))
    expect(strings(d).some((s) => s.includes('assets/a.svg') && s.startsWith('['))).toBe(true)
  })
})

describe('pdf export', () => {
  const fontDir = new URL('./fonts/', import.meta.url)
  const loadFonts: FontLoader = async (family) => {
    const name = family === 'sans' ? 'LiberationSans' : 'LiberationSerif'
    const f = (s: string) => new Uint8Array(readFileSync(new URL(`${name}-${s}.ttf`, fontDir)))
    return {
      normal: f('Regular'),
      bold: f('Bold'),
      italics: f('Italic'),
      bolditalics: f('BoldItalic'),
    }
  }

  it('describes itself as a book exporter', () => {
    expect(pdfExporter).toMatchObject({
      id: 'pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      kinds: ['book'],
    })
  })

  it('produces a PDF with Polish text, title page, TOC and chapter headers', async () => {
    const chapters = ['a', 'b', 'c'].map((id) =>
      chapter(id, {
        title: `Rozdział ${id}: Zażółć gęślą jaźń`,
        partTitle: id === 'b' ? 'Część druga' : undefined,
        blocks: Array.from({ length: 30 }, () => para('Zażółć gęślą jaźń. '.repeat(40), 'justify')),
        footnotes: [{ n: 1, runs: [t('Przypis')] }],
      }),
    )
    const doc = mk(
      { titlePage: true, toc: true, pageNumbers: true, runningHeader: 'chapter', font: 'sans' },
      chapters,
    )
    doc.meta.language = 'pl'
    doc.chapters[0]!.blocks.push({ type: 'image', bytes: PNG, path: 'x.png' })
    const bytes = await createPdfExporter({ loadFonts }).export(doc)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(10_000)
  })
})
