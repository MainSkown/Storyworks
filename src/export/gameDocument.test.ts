import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildGameDocument, defaultGameDocumentOptions, type GameDocumentTexts } from './gameDocument'
import { docxExporter } from './docx'
import { createPdfExporter, type FontLoader } from './pdf'
import { gameSource } from './gameTestSource'
import type { ExportBlock, Run } from './model'

const texts: GameDocumentTexts = {
  overview: 'Overview',
  glossary: 'Glossary',
  uncategorized: 'No category',
  untitled: 'Untitled',
  missing: 'Deleted link',
  status: { idea: 'Idea', designed: 'Designed', implemented: 'Implemented', cut: 'Cut' },
  tags: 'Tags',
  parameters: 'Parameters',
  links: 'Links',
}

const doc = (...c: unknown[]) => ({ type: 'doc', content: c })
const plain = (runs: Run[]) => runs.map((r) => ('text' in r ? r.text : '')).join('')
const lines = (blocks: ExportBlock[]) =>
  blocks.map((b) =>
    b.type === 'heading' || b.type === 'paragraph'
      ? `${b.type}:${plain(b.runs)}`
      : b.type === 'list'
        ? `list:${b.items.map(plain).join('|')}`
        : b.type,
  )

const mech = (id: string, categoryId: string, title: string) => ({
  version: 1 as const, id, title, summary: '', categoryId, status: 'idea' as const, tags: [],
  description: doc(), parameters: [], links: [],
})

describe('buildGameDocument', () => {
  it('orders Overview, mechanics by category, Glossary', () => {
    const src = gameSource({
      categories: [
        { version: 1, id: 'k1', name: 'Combat', color: '#f00' },
        { version: 1, id: 'k2', name: 'Economy', color: '#0f0' },
      ],
      mechanics: [mech('m1', 'k2', 'Shop'), mech('m2', 'k1', 'Dodge'), mech('m3', 'k2', 'Coins')],
    })
    const d = buildGameDocument(src, defaultGameDocumentOptions(), texts)
    expect(d.chapters.map((c) => c.title)).toEqual(['Overview', 'Combat', 'Economy', 'Glossary'])
    const eco = d.chapters[2]!.blocks.filter((b) => b.type === 'heading').map((b) => plain((b as { runs: Run[] }).runs))
    expect(eco).toEqual(['Shop', 'Coins'])
    expect(d.meta).toEqual({ title: 'Game', author: 'Me', language: 'en' })
  })

  it('omits empty sections and categories, keeps mechanics of a missing category last', () => {
    const src = gameSource({
      overview: null,
      glossary: [],
      categories: [
        { version: 1, id: 'k1', name: 'Combat', color: '#f00' },
        { version: 1, id: 'k2', name: 'Empty', color: '#0f0' },
      ],
      mechanics: [mech('m1', 'gone', 'Orphan'), mech('m2', 'k1', 'Dodge')],
    })
    expect(buildGameDocument(src, defaultGameDocumentOptions(), texts).chapters.map((c) => c.title)).toEqual(['Combat', 'No category'])
    expect(buildGameDocument(gameSource({ overview: doc(), mechanics: [], glossary: [] }), defaultGameDocumentOptions(), texts).chapters).toEqual([])
  })

  it('leaves out a section the options exclude', () => {
    const d = buildGameDocument(gameSource(), { ...defaultGameDocumentOptions(), mechanics: false }, texts)
    expect(d.chapters.map((c) => c.title)).toEqual(['Overview', 'Glossary'])
    const o = buildGameDocument(gameSource(), { overview: false, mechanics: true, glossary: false }, texts)
    expect(o.chapters.map((c) => c.title)).toEqual(['Combat'])
  })

  it('writes a mechanic as title, status and tags, summary, description, parameters, links', () => {
    const b = buildGameDocument(gameSource(), defaultGameDocumentOptions(), texts).chapters.find((c) => c.title === 'Combat')!.blocks
    expect(lines(b)).toEqual([
      'heading:Dodge',
      'paragraph:Implemented · Tags: core',
      'paragraph:Roll away',
      'paragraph:Press space.',
      'paragraph:Parameters',
      'list:Cooldown: 2s',
      'paragraph:Links',
      'list:trust|Talk|Deleted link',
    ])
  })

  it('prints a broken link with the fallback label and an untitled link as untitled', () => {
    const src = gameSource()
    src.linkNames.item.set('c1', '  ')
    const list = buildGameDocument(src, defaultGameDocumentOptions(), texts).chapters[1]!.blocks.find((x) => x.type === 'list' && x.items.length === 3)!
    expect((list as { items: Run[][] }).items.map(plain)).toEqual(['trust', 'Untitled', 'Deleted link'])
  })

  it('converts overview rich text to blocks with marks', () => {
    const rich = doc({ type: 'paragraph', content: [{ type: 'text', text: 'Hi', marks: [{ type: 'bold' }] }] })
    const d = buildGameDocument(gameSource({ overview: rich }), defaultGameDocumentOptions(), texts)
    expect(d.chapters[0]!.blocks).toEqual([{ type: 'paragraph', runs: [{ text: 'Hi', bold: true }], align: 'left' }])
  })

  it('sorts the glossary A to Z', () => {
    const src = gameSource({
      glossary: [
        { id: 'g1', term: 'zeta', definition: 'Z' },
        { id: 'g2', term: 'Alpha', definition: 'A' },
      ],
    })
    const g = buildGameDocument(src, defaultGameDocumentOptions(), texts).chapters.at(-1)!
    expect(lines(g.blocks)).toEqual(['paragraph:Alpha: A', 'paragraph:zeta: Z'])
  })

  it('keeps valid default export options', () => {
    expect(buildGameDocument(gameSource(), defaultGameDocumentOptions(), texts).options.pageSize).toBe('A4')
  })

  it('exports to non-empty PDF and DOCX bytes', async () => {
    const fontDir = new URL('./fonts/', import.meta.url)
    const loadFonts: FontLoader = async () => {
      const f = (s: string) => new Uint8Array(readFileSync(new URL(`LiberationSerif-${s}.ttf`, fontDir)))
      return { normal: f('Regular'), bold: f('Bold'), italics: f('Italic'), bolditalics: f('BoldItalic') }
    }
    const d = buildGameDocument(gameSource(), defaultGameDocumentOptions(), texts)
    for (const e of [createPdfExporter({ loadFonts }), docxExporter]) expect((await e.export(d)).length).toBeGreaterThan(500)
  })
})
