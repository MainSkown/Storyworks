import { describe, expect, it } from 'vitest'
import { markdownExporter, toMarkdown } from './markdown'
import { defaultExportOptions } from './options'
import type { ExportBlock, ExportDoc, Run } from './model'

const p = (...runs: Run[]): ExportBlock => ({ type: 'paragraph', runs, align: 'left' })

const doc = (blocks: ExportBlock[], title = 'My *Game*'): ExportDoc => ({
  meta: { title, author: 'Me', language: 'en' },
  options: defaultExportOptions(),
  chapters: [{ id: 'c1', title: 'Chapter_1', blocks, footnotes: [] }],
  appendices: [],
  warnings: [],
})

describe('toMarkdown', () => {
  it('uses # for the title and ## for chapters, shifting inner headings down', () => {
    const md = toMarkdown(doc([{ type: 'heading', level: 1, runs: [{ text: 'Dodge' }], align: 'left' }, p({ text: 'x' })]))
    const out = md.split('\n')
    expect(out[0]).toBe('# My \\*Game\\*')
    expect(out).toContain('## Chapter\\_1')
    expect(out).toContain('### Dodge')
  })

  it('writes bold and italic runs and escapes special characters', () => {
    const md = toMarkdown(doc([p({ text: 'a*b_c', bold: true }, { text: ' [x] #1 <t>', italic: true }, { text: ' `q` \\' })]))
    expect(md).toContain('**a\\*b\\_c** *\\[x\\] \\#1 \\<t\\>* \\`q\\` \\\\')
  })

  it('writes lists, nested levels and quotes', () => {
    const md = toMarkdown(doc([
      { type: 'list', ordered: false, items: [[{ text: 'one' }], [{ text: 'sub' }]], levels: [0, 1] },
      { type: 'list', ordered: true, items: [[{ text: 'a' }], [{ text: 'b' }]], levels: [0, 0] },
      { type: 'quote', paragraphs: [[{ text: 'q1' }], [{ text: 'q2' }]], align: 'left' },
    ]))
    expect(md).toContain('- one\n  - sub')
    expect(md).toContain('1. a\n2. b')
    expect(md).toContain('> q1\n>\n> q2')
  })

  it('writes footnotes and appendices', () => {
    const d = doc([p({ text: 'x' }, { footnote: 1 })])
    d.chapters[0]!.footnotes = [{ n: 1, runs: [{ text: 'note' }] }]
    d.appendices = [{ kind: 'glossary', title: 'Terms', blocks: [p({ text: 'T' })] }]
    const md = toMarkdown(d)
    expect(md).toContain('x[^1]')
    expect(md).toContain('[^1]: note')
    expect(md).toContain('## Terms')
  })

  it('exporter returns UTF-8 bytes', async () => {
    const bytes = await markdownExporter.export(doc([p({ text: 'Zażółć' })]))
    expect(new TextDecoder().decode(bytes)).toContain('Zażółć')
    expect([markdownExporter.extension, markdownExporter.mime]).toEqual(['md', 'text/markdown'])
  })
})
