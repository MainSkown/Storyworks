import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LINES_PER_PAGE, paginate, type ScriptElement } from '../editor/screenplay/layout'
import type { ScriptDoc } from './scriptModel'
import { defaultScriptExportOptions, type ScriptExportOptions } from './scriptOptions'
import { createPdfScriptExporter, scriptPages, toScriptDocDefinition, type MonoFontLoader } from './pdfScript'
import { flatElements } from './scriptModel'

const el = (type: ScriptElement['type'], text: string, number?: number): ScriptElement => ({ type, text, number })
function mk(elements: ScriptElement[], options: Partial<ScriptExportOptions> = {}, language = 'en'): ScriptDoc {
  return {
    meta: { title: 'Łódź Noir', author: 'Jan Kowalski', language },
    titlePage: { contact: 'jan@example.com', date: '2026-11-03' },
    options: { ...defaultScriptExportOptions(), ...options },
    sequences: [{ id: 'q', title: 'Seq', scenes: [{ id: 's', title: 'S', elements }] }],
    warnings: [],
  }
}
const filler = (n: number) => el('action', Array.from({ length: n }, () => 'a'.repeat(60)).join(' '))
const speech = Array.from({ length: 10 }, (_, i) => `${String.fromCharCode(65 + i).repeat(29)}.`).join(' ')
const script = [
  el('sceneHeading', 'int. kawiarnia - dzień', 1),
  el('action', 'Zażółć gęślą jaźń.'),
  filler(40),
  el('character', 'anna'),
  el('dialogue', speech),
  el('transition', 'cut to:'),
]

type N = Record<string, unknown>
const nodes = (def: { content: unknown }) => def.content as N[]
const texts = (def: { content: unknown }) => nodes(def).map((n) => n.text as string)
const pos = (n: N) => n.absolutePosition as { x: number; y: number }

describe('screenplay pdf definition', () => {
  it('draws every layout line at the standard position and breaks between pages', () => {
    const doc = mk(script, { titlePage: false })
    const pages = scriptPages(doc)
    const def = toScriptDocDefinition(doc, pages)
    expect(def.pageMargins).toEqual([0, 0, 0, 0])
    const breaks = nodes(def).filter((n) => n.pageBreak === 'before')
    expect(breaks).toHaveLength(pages.length - 1)
    const heading = nodes(def).find((n) => n.text === 'INT. KAWIARNIA - DZIEŃ')!
    expect(pos(heading)).toEqual({ x: 108, y: 72 }) // 1.5 in left, 1 in top
    const cue = nodes(def).find((n) => n.text === 'ANNA')!
    expect(pos(cue).x).toBe(108 + 20 * 7.2)
  })

  it('right-aligns transitions to the text edge', () => {
    const def = toScriptDocDefinition(mk(script), scriptPages(mk(script)))
    const tr = nodes(def).find((n) => n.text === 'CUT TO:')!
    expect(pos(tr).x + 'CUT TO:'.length * 7.2).toBeCloseTo(108 + 60 * 7.2)
  })

  it('puts the scene number in both margins', () => {
    const def = toScriptDocDefinition(mk(script), scriptPages(mk(script)))
    const ones = nodes(def).filter((n) => n.text === '1' && pos(n).y === 72)
    expect(ones.map((n) => pos(n).x).sort((a, b) => a - b)).toEqual([108 - 14.4 - 7.2, 108 + 432 + 14.4])
  })

  it('numbers pages from the second, at the top right, and honours the option', () => {
    const doc = mk([filler(55), filler(5)])
    const def = toScriptDocDefinition(doc, scriptPages(doc))
    const num = nodes(def).filter((n) => n.text === '2.')
    expect(num).toHaveLength(1)
    expect(pos(num[0]!).y).toBe(36)
    expect(pos(num[0]!).x + 2 * 7.2).toBeCloseTo(540)
    const off = mk([filler(55), filler(5)], { pageNumbers: false })
    expect(texts(toScriptDocDefinition(off, scriptPages(off)))).not.toContain('2.')
  })

  it('adds a title page that is not counted, only when on', () => {
    const doc = mk([filler(5)])
    const withTitle = toScriptDocDefinition(doc, scriptPages(doc))
    expect(texts(withTitle)).toEqual(expect.arrayContaining(['ŁÓDŹ NOIR', 'Written by', 'Jan Kowalski', 'jan@example.com', '2026-11-03']))
    expect(nodes(withTitle).filter((n) => n.pageBreak === 'before')).toHaveLength(1)
    const none = mk([filler(5)], { titlePage: false })
    expect(texts(toScriptDocDefinition(none, scriptPages(none)))).not.toContain('Written by')
  })

  it('uses Polish labels for the title page and speech breaks', () => {
    const doc = mk(script, {}, 'pl')
    const t = texts(toScriptDocDefinition(doc, scriptPages(doc)))
    expect(t).toContain('Scenariusz:')
    expect(t.some((x) => x === '(DALEJ)' || x === 'ANNA (CD.)')).toBe(true)
  })

  it('page count equals the paginator and A4 holds more rows', () => {
    const doc = mk(script)
    expect(scriptPages(doc)).toEqual(paginate(flatElements(doc), { pageSize: 'Letter', labels: { more: '(MORE)', contd: "(CONT'D)" } }))
    const a4 = mk([filler(LINES_PER_PAGE.Letter + 1)], { pageSize: 'A4' })
    expect(scriptPages(a4)).toHaveLength(1)
  })

  it('leaves out (MORE) and (CONT\'D) when the option is off', () => {
    const doc = mk(script, { moreContd: false })
    expect(texts(toScriptDocDefinition(doc, scriptPages(doc))).join('|')).not.toMatch(/MORE|CONT/)
  })
})

describe('screenplay pdf file', () => {
  const dir = new URL('./fonts/', import.meta.url)
  const loadFonts: MonoFontLoader = async () => {
    const f = (s: string) => new Uint8Array(readFileSync(new URL(`LiberationMono-${s}.ttf`, dir)))
    return { normal: f('Regular'), bold: f('Bold'), italics: f('Italic'), bolditalics: f('BoldItalic') }
  }
  const pageObjects = (bytes: Uint8Array) =>
    (new TextDecoder('latin1').decode(bytes).match(/\/Type \/Page(?![s\w])/g) ?? []).length

  it('is a PDF with exactly the laid-out pages plus the title page', async () => {
    const doc = mk(script)
    const bytes = await createPdfScriptExporter({ loadFonts }).export(doc)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(pageObjects(bytes)).toBe(scriptPages(doc).length + 1)
  })

  it('has no title page object when off', async () => {
    const doc = mk(script, { titlePage: false })
    const bytes = await createPdfScriptExporter({ loadFonts }).export(doc)
    expect(pageObjects(bytes)).toBe(scriptPages(doc).length)
  })

  it('describes itself as a screenplay exporter', () => {
    expect(createPdfScriptExporter({ loadFonts })).toMatchObject({
      id: 'pdf-script', model: 'script', extension: 'pdf', mime: 'application/pdf', kinds: ['screenplay'],
    })
  })
})
