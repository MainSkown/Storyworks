import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { docxExporter } from './docx'
import { defaultExportOptions, type ExportOptions } from './options'
import type { ExportChapter, ExportDoc } from './model'

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

const chapter = (id: string, title: string, extra: Partial<ExportChapter> = {}): ExportChapter => ({
  id,
  title,
  blocks: [{ type: 'paragraph', runs: [{ text: 'Treść rozdziału.' }], align: 'left' }],
  footnotes: [],
  ...extra,
})

const make = (
  opts: Partial<ExportOptions> = {},
  chapters: ExportChapter[] = [chapter('a', 'Pierwszy')],
  appendices: ExportDoc['appendices'] = [],
): ExportDoc => ({
  meta: { title: 'Księga Żółwia', author: 'Zofia Łąk', language: 'pl' },
  options: { ...defaultExportOptions(), ...opts },
  chapters,
  appendices,
  warnings: [],
})

async function parts(doc: ExportDoc): Promise<Record<string, string>> {
  const files = unzipSync(await docxExporter.export(doc))
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]))
}
const headerFooter = (p: Record<string, string>, kind: 'header' | 'footer') =>
  Object.entries(p)
    .filter(([k]) => k.startsWith(`word/${kind}`) && k.endsWith('.xml'))
    .map(([, v]) => v)
    .join('\n')

describe('docxExporter', () => {
  it('describes itself as a book docx exporter', () => {
    expect(docxExporter.id).toBe('docx')
    expect(docxExporter.extension).toBe('docx')
    expect(docxExporter.kinds).toContain('book')
  })

  it('produces a zip with word/document.xml and chapter titles', async () => {
    const p = await parts(make({}, [chapter('a', 'Pierwszy'), chapter('b', 'Drugi')]))
    expect(p['word/document.xml']).toContain('Pierwszy')
    expect(p['word/document.xml']).toContain('Drugi')
  })

  it('keeps Polish characters intact', async () => {
    const p = await parts(
      make({}, [
        chapter('a', 'Zażółć', {
          blocks: [{ type: 'paragraph', runs: [{ text: 'gęślą jaźń ŻÓŁĆ' }], align: 'left' }],
        }),
      ]),
    )
    expect(p['word/document.xml']).toContain('Zażółć')
    expect(p['word/document.xml']).toContain('gęślą jaźń ŻÓŁĆ')
  })

  it('writes footnote text to footnotes.xml', async () => {
    const p = await parts(
      make({}, [
        chapter('a', 'Pierwszy', {
          blocks: [
            { type: 'paragraph', runs: [{ text: 'Tekst' }, { footnote: 1 }], align: 'left' },
          ],
          footnotes: [{ n: 1, runs: [{ text: 'Przypis pierwszy', bold: true }] }],
        }),
        chapter('b', 'Drugi', {
          blocks: [
            { type: 'paragraph', runs: [{ text: 'Tekst' }, { footnote: 1 }], align: 'left' },
          ],
          footnotes: [{ n: 1, runs: [{ text: 'Przypis w drugim' }] }],
        }),
      ]),
    )
    expect(p['word/footnotes.xml']).toContain('Przypis pierwszy')
    expect(p['word/footnotes.xml']).toContain('Przypis w drugim')
    expect(p['word/document.xml'].match(/footnoteReference/g)?.length).toBe(2)
  })

  it('adds the page number field only when pageNumbers is on', async () => {
    const on = await parts(make({ pageNumbers: true }))
    const off = await parts(make({ pageNumbers: false }))
    expect(headerFooter(on, 'footer')).toContain('PAGE')
    expect(headerFooter(off, 'footer')).not.toContain('PAGE')
  })

  it('shows the book title as running header only when asked', async () => {
    const book = await parts(make({ runningHeader: 'book' }))
    const none = await parts(make({ runningHeader: 'none' }))
    expect(headerFooter(book, 'header')).toContain('Księga Żółwia')
    expect(headerFooter(none, 'header')).not.toContain('Księga Żółwia')
  })

  it('uses the chapter title as running header for "chapter"', async () => {
    const p = await parts(
      make({ runningHeader: 'chapter' }, [chapter('a', 'Pierwszy'), chapter('b', 'Drugi')]),
    )
    const h = headerFooter(p, 'header')
    expect(h).toContain('Pierwszy')
    expect(h).toContain('Drugi')
  })

  it('includes the title page only when on', async () => {
    const on = await parts(make({ titlePage: true }))
    const off = await parts(make({ titlePage: false }))
    expect(on['word/document.xml']).toContain('Zofia Łąk')
    expect(off['word/document.xml']).not.toContain('Zofia Łąk')
    expect(off['word/document.xml']).not.toContain('Księga Żółwia')
  })

  it('adds a TOC field only when on', async () => {
    const on = await parts(make({ toc: true }))
    const off = await parts(make({ toc: false }))
    expect(on['word/document.xml']).toContain('TOC')
    expect(off['word/document.xml']).not.toContain('TOC \\')
  })

  it('writes a placeholder for a missing image', async () => {
    const p = await parts(
      make({}, [
        chapter('a', 'Pierwszy', { blocks: [{ type: 'image', bytes: null, path: 'img/x.png' }] }),
      ]),
    )
    expect(p['word/document.xml']).toContain('[missing image: img/x.png]')
  })

  it('embeds a present image', async () => {
    const p = await parts(
      make({}, [
        chapter('a', 'Pierwszy', { blocks: [{ type: 'image', bytes: PNG, path: 'img/x.png' }] }),
      ]),
    )
    expect(p['word/document.xml']).toContain('<w:drawing>')
  })

  it('maps justify to "both"', async () => {
    const p = await parts(
      make({}, [
        chapter('a', 'Pierwszy', {
          blocks: [{ type: 'paragraph', runs: [{ text: 'x' }], align: 'justify' }],
        }),
      ]),
    )
    expect(p['word/document.xml']).toContain('w:jc w:val="both"')
  })

  it('strips control characters and turns newline into a break', async () => {
    const p = await parts(
      make({}, [
        chapter('a', 'Pierwszy', {
          blocks: [
            {
              type: 'paragraph',
              runs: [{ text: 'a\u0000b\u0008c\u000bd\u001fe\nf' }],
              align: 'left',
            },
          ],
        }),
      ]),
    )
    const xml = p['word/document.xml']
    expect(xml).toContain('abcde')
    // eslint-disable-next-line no-control-regex
    expect(xml).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/)
    expect(xml).toContain('<w:br/>')
  })

  it('includes appendix titles', async () => {
    const p = await parts(
      make(
        {},
        [chapter('a', 'Pierwszy')],
        [
          {
            kind: 'glossary',
            title: 'Słowniczek',
            blocks: [{ type: 'paragraph', runs: [{ text: 'Hasło' }], align: 'left' }],
          },
        ],
      ),
    )
    expect(p['word/document.xml']).toContain('Słowniczek')
    expect(p['word/document.xml']).toContain('Hasło')
  })

  it('shows part titles outside the heading levels', async () => {
    const p = await parts(make({}, [chapter('a', 'Pierwszy', { partTitle: 'Część Pierwsza' })]))
    expect(p['word/document.xml']).toContain('Część Pierwsza')
  })

  it('renders lists, quotes and scene breaks', async () => {
    const p = await parts(
      make({}, [
        chapter('a', 'Pierwszy', {
          blocks: [
            {
              type: 'list',
              ordered: true,
              items: [[{ text: 'raz' }], [{ text: 'dwa' }]],
              levels: [0, 1],
            },
            { type: 'list', ordered: false, items: [[{ text: 'kropka' }]], levels: [0] },
            { type: 'quote', paragraphs: [[{ text: 'cytat' }]], align: 'left' },
            { type: 'sceneBreak' },
          ],
        }),
      ]),
    )
    const xml = p['word/document.xml']
    for (const t of ['raz', 'dwa', 'kropka', 'cytat', '* * *']) expect(xml).toContain(t)
  })

  it('uses the chosen page size', async () => {
    const p = await parts(make({ pageSize: 'A5' }))
    expect(p['word/document.xml']).toContain('w:w="8390"')
  })
})
