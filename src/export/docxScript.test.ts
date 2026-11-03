import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { docxScriptExporter } from './docxScript'
import { defaultScriptExportOptions } from './scriptOptions'
import type { ScriptDoc } from './scriptModel'
import type { ScriptElement } from '../editor/screenplay/layout'

const ELEMENTS: ScriptElement[] = [
  { type: 'sceneHeading', text: 'int. kuchnia - dzień' },
  { type: 'action', text: 'Żółw wchodzi.\nRozgląda się.' },
  { type: 'character', text: 'Zofia' },
  { type: 'parenthetical', text: '(cicho)' },
  { type: 'dialogue', text: 'Cześć.' },
  { type: 'action', text: '   ' },
  { type: 'transition', text: 'cut to:' },
]

const make = (
  opts: Partial<ScriptDoc['options']> = {},
  elements: ScriptElement[] = ELEMENTS,
  language = 'pl',
): ScriptDoc => ({
  meta: { title: 'Księga Żółwia', author: 'Zofia Łąk', language },
  titlePage: { contact: 'zofia@example.com', date: '2026-01-02' },
  options: { ...defaultScriptExportOptions(), ...opts },
  sequences: [{ id: 'q', title: 'Akt pierwszy', scenes: [{ id: 's', title: 'Scena', elements }] }],
  warnings: [],
})

async function parts(doc: ScriptDoc): Promise<Record<string, string>> {
  const files = unzipSync(await docxScriptExporter.export(doc))
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]))
}
const headers = (p: Record<string, string>) =>
  Object.keys(p).filter((k) => /^word\/header\d*\.xml$/.test(k))

describe('docxScriptExporter', () => {
  it('describes itself as a screenplay docx exporter', () => {
    expect(docxScriptExporter.id).toBe('docx-script')
    expect(docxScriptExporter.labelKey).toBe('export.formats.docx')
    expect(docxScriptExporter.model).toBe('script')
    expect(docxScriptExporter.kinds).toEqual(['screenplay'])
    expect(docxScriptExporter.extension).toBe('docx')
  })

  it('writes element text, uppercases heading, cue and transition, skips blank elements', async () => {
    const p = await parts(make({ titlePage: false }))
    const xml = p['word/document.xml']!
    expect(xml).toContain('INT. KUCHNIA - DZIEŃ')
    expect(xml).toContain('>ZOFIA<')
    expect(xml).toContain('CUT TO:')
    expect(xml).toContain('Żółw wchodzi.')
    expect(xml).toContain('<w:br/>')
    expect(xml).toContain('Rozgląda się.')
    expect(xml).not.toContain('Akt pierwszy')
  })

  it('defines the named paragraph styles and uses them', async () => {
    const p = await parts(make({ titlePage: false }))
    for (const name of [
      'Scene Heading',
      'Action',
      'Character',
      'Dialogue',
      'Parenthetical',
      'Transition',
    ])
      expect(p['word/styles.xml']).toContain(`<w:name w:val="${name}"/>`)
    expect(p['word/document.xml']).toContain('w:val="SceneHeading"')
    expect(p['word/document.xml']).toContain('w:val="Dialogue"')
  })

  it('sets Courier New 12 pt with exact single spacing', async () => {
    const styles = (await parts(make()))['word/styles.xml']!
    expect(styles).toContain('Courier New')
    expect(styles).toMatch(
      /w:line="240"[^>]*w:lineRule="exact"|w:lineRule="exact"[^>]*w:line="240"/,
    )
  })

  it('prints scene numbers at both edges only when elements carry one', async () => {
    const withNo = ELEMENTS.map((e, i) => (i === 0 ? { ...e, number: 7 } : e))
    const xml = (await parts(make({ titlePage: false }, withNo)))['word/document.xml']!
    expect(xml.match(/<w:t[^>]*>7<\/w:t>/g)).toHaveLength(2)
    expect(xml).toContain('w:hanging="864"')
    expect(xml).toContain('w:val="right"')
    const plain = (await parts(make({ titlePage: false })))['word/document.xml']!
    expect(plain).not.toContain('w:hanging')
  })

  it('adds a page-number header only when pageNumbers is on', async () => {
    const on = await parts(make({ pageNumbers: true }))
    expect(headers(on).length).toBeGreaterThan(0)
    expect(on['word/document.xml']).toContain('<w:titlePg/>')
    expect(on['word/document.xml']).toContain('w:start="1"')
    const off = await parts(make({ pageNumbers: false }))
    expect(headers(off)).toHaveLength(0)
  })

  it('adds the title page only when titlePage is on, with a localised label', async () => {
    const pl = (await parts(make({ titlePage: true })))['word/document.xml']!
    expect(pl).toContain('KSIĘGA ŻÓŁWIA')
    expect(pl).toContain('Scenariusz:')
    expect(pl).toContain('Zofia Łąk')
    expect(pl).toContain('zofia@example.com')
    expect(pl).toContain('2026-01-02')
    const en = (await parts(make({ titlePage: true }, ELEMENTS, 'en')))['word/document.xml']!
    expect(en).toContain('Written by')
    const off = (await parts(make({ titlePage: false })))['word/document.xml']!
    expect(off).not.toContain('KSIĘGA ŻÓŁWIA')
    expect(off).not.toContain('zofia@example.com')
  })

  it('uses Letter or A4 page sizes', async () => {
    const letter = (await parts(make({ pageSize: 'Letter' })))['word/document.xml']!
    const a4 = (await parts(make({ pageSize: 'A4' })))['word/document.xml']!
    expect(letter).toContain('w:w="12240"')
    expect(a4).toContain('w:w="11906"')
    expect(a4).not.toContain('w:w="12240"')
  })

  it('still produces a document for an empty script', async () => {
    const p = await parts(make({}, []))
    expect(p['word/document.xml']).toContain('<w:body>')
  })
})
