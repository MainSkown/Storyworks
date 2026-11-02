import { describe, expect, it } from 'vitest'
import { buildAppendices, type AppendixInput } from './appendices'
import { defaultExportOptions, type ExportOptions } from './options'
import { gregorianCalendar } from '../calendar'
import type { ExportBlock, ExportChapter, Run } from './model'
import type { CodexEntry } from '../project/schemas/codexEntry'
import type { Timeline } from '../timeline/schema'
import type { ManuscriptNode } from '../project/schemas/manifest'

const entry = (id: string, name: string, extra: Partial<CodexEntry> = {}): CodexEntry => ({
  version: 2,
  id,
  typeId: 'char',
  name,
  aliases: [],
  image: null,
  notes: { type: 'doc', content: [] },
  tags: [],
  ruleIds: [],
  appendixText: '',
  includeInAppendices: true,
  states: [],
  ...extra,
})
const n = (
  id: string,
  type: ManuscriptNode['type'],
  children: ManuscriptNode[] = [],
): ManuscriptNode => ({
  id,
  type,
  title: `T-${id}`,
  children,
})
const chapter = (id: string): ExportChapter => ({ id, title: `T-${id}`, blocks: [], footnotes: [] })
const link = (id: string, scene: string, entryId: string) => ({
  id,
  kind: 'codex',
  from: { item: scene, block: 'b1' },
  to: { item: entryId },
})
const node = (
  id: string,
  title: string,
  date: { year: number; month: number; day: number } | null,
) => ({
  id,
  title,
  description: { type: 'doc', content: [] },
  date,
  color: null,
  tag: null,
  branchId: null,
  pos: { x: 0, y: 0 },
  codexIds: [],
  ruleIds: [],
})
const timeline = (nodes: ReturnType<typeof node>[], edges: Timeline['edges'] = []): Timeline =>
  ({ version: 1, id: 'tl', name: 'TL', nodes, edges, branches: [] }) as unknown as Timeline

const opts = (f: (a: ExportOptions['appendices']) => void): ExportOptions => {
  const o = defaultExportOptions()
  f(o.appendices)
  return o
}
const personaOn = (a: ExportOptions['appendices']) => (a.personae = { on: true, typeIds: ['char'] })

function input(extra: Partial<AppendixInput> = {}): AppendixInput {
  return {
    entries: [],
    manuscript: [n('c1', 'chapter', [n('s1', 'scene')]), n('c2', 'chapter', [n('s2', 'scene')])],
    links: [],
    timelines: [],
    calendar: gregorianCalendar('cal'),
    language: 'en',
    titles: { personae: 'Dramatis personae', glossary: 'Glossary', chronology: 'Chronology' },
    labels: { firstAppearance: 'First appearance' },
    ...extra,
  }
}
const both = [chapter('c1'), chapter('c2')]

const runText = (runs: Run[]) => runs.map((r) => ('text' in r ? r.text : '')).join('')
const texts = (blocks: ExportBlock[]): string[] =>
  blocks.flatMap((b) =>
    b.type === 'paragraph' ? [runText(b.runs)] : b.type === 'list' ? b.items.map(runText) : [],
  )

describe('toggles and empties', () => {
  it('returns nothing when every toggle is off', () => {
    const i = input({ entries: [entry('e1', 'Ann')] })
    expect(buildAppendices(i, defaultExportOptions(), both)).toEqual([])
  })

  it('omits an appendix with no entries', () => {
    expect(buildAppendices(input(), opts(personaOn), both)).toEqual([])
  })

  it('omits chronology for an unknown timeline id', () => {
    const o = opts((a) => (a.chronology = { on: true, timelineId: 'nope' }))
    expect(buildAppendices(input(), o, both)).toEqual([])
  })
})

describe('dramatis personae', () => {
  it('skips entries that opted out and other types', () => {
    const i = input({
      entries: [
        entry('e1', 'Ann'),
        entry('e2', 'Bob', { includeInAppendices: false }),
        entry('e3', 'Sword', { typeId: 'item' }),
      ],
    })
    const [a] = buildAppendices(i, opts(personaOn), both)
    expect(a!.kind).toBe('personae')
    expect(a!.title).toBe('Dramatis personae')
    expect(texts(a!.blocks)).toEqual(['Ann'])
  })

  it('writes bold name, italic aliases and the appendix text, never notes', () => {
    const i = input({
      entries: [
        entry('e1', 'Ann', {
          aliases: ['A', 'Annie'],
          appendixText: 'A baker.',
          notes: { type: 'doc', content: [{ type: 'text', text: 'SECRET' }] },
        }),
      ],
    })
    const [a] = buildAppendices(i, opts(personaOn), both)
    const first = a!.blocks[0]!
    expect(first).toMatchObject({
      type: 'paragraph',
      runs: [
        { text: 'Ann', bold: true },
        { text: ' (A, Annie)', italic: true },
      ],
    })
    expect(texts(a!.blocks)).toEqual(['Ann (A, Annie)', 'A baker.'])
    expect(JSON.stringify(a)).not.toContain('SECRET')
  })

  it('sorts by name', () => {
    const i = input({ entries: [entry('e1', 'Zed'), entry('e2', 'Ann'), entry('e3', 'Mia')] })
    const [a] = buildAppendices(i, opts(personaOn), both)
    expect(texts(a!.blocks)).toEqual(['Ann', 'Mia', 'Zed'])
  })

  it('sorts Polish letters by the book language', () => {
    const i = input({
      entries: [entry('e1', 'Zofia'), entry('e2', 'Łukasz'), entry('e3', 'Lena')],
      language: 'pl',
    })
    const [a] = buildAppendices(i, opts(personaOn), both)
    expect(texts(a!.blocks)).toEqual(['Lena', 'Łukasz', 'Zofia'])
  })
})

describe('first appearance', () => {
  it('names the chapter of the first linked scene in manuscript order', () => {
    const i = input({
      entries: [entry('e1', 'Ann')],
      links: [link('l1', 's2', 'e1'), link('l2', 's1', 'e1')],
    })
    const [a] = buildAppendices(i, opts(personaOn), both)
    expect(texts(a!.blocks)).toEqual(['Ann', 'First appearance: T-c1'])
  })

  it('ignores scenes in chapters that are not exported', () => {
    const i = input({
      entries: [entry('e1', 'Ann'), entry('e2', 'Bob')],
      links: [link('l1', 's1', 'e1'), link('l2', 's2', 'e1'), link('l3', 's1', 'e2')],
    })
    const [a] = buildAppendices(i, opts(personaOn), [chapter('c2')])
    expect(texts(a!.blocks)).toEqual(['Ann', 'First appearance: T-c2', 'Bob'])
  })

  it('omits the line when the entry is not linked from any scene', () => {
    const i = input({ entries: [entry('e1', 'Ann')] })
    const [a] = buildAppendices(i, opts(personaOn), both)
    expect(texts(a!.blocks)).toEqual(['Ann'])
  })
})

describe('glossary', () => {
  it('uses its own types and lets personae win a shared type', () => {
    const i = input({
      entries: [entry('e1', 'Ann'), entry('e2', 'Sword', { typeId: 'item' })],
    })
    const o = opts((a) => {
      a.personae = { on: true, typeIds: ['char'] }
      a.glossary = { on: true, typeIds: ['char', 'item'] }
    })
    const [p, g] = buildAppendices(i, o, both)
    expect(texts(p!.blocks)).toEqual(['Ann'])
    expect(g!.kind).toBe('glossary')
    expect(texts(g!.blocks)).toEqual(['Sword'])
  })

  it('keeps a type for the glossary when personae is off', () => {
    const i = input({ entries: [entry('e1', 'Ann')] })
    const o = opts((a) => (a.glossary = { on: true, typeIds: ['char'] }))
    const out = buildAppendices(i, o, both)
    expect(out.map((x) => x.kind)).toEqual(['glossary'])
  })
})

describe('chronology', () => {
  const chrono = (tl: Timeline) => {
    const o = opts((a) => (a.chronology = { on: true, timelineId: 'tl' }))
    const [a] = buildAppendices(input({ timelines: [tl] }), o, both)
    return a!
  }
  const d = (year: number, month = 0, day = 1) => ({ year, month, day })

  it('sorts dated nodes by date and formats the date', () => {
    const a = chrono(timeline([node('n1', 'Late', d(300, 1, 5)), node('n2', 'Early', d(100))]))
    expect(a.kind).toBe('chronology')
    expect(a.title).toBe('Chronology')
    expect(texts(a.blocks)).toEqual(['1 January 100 — Early', '5 February 300 — Late'])
  })

  it('puts undated nodes last in original order with a dash', () => {
    const a = chrono(
      timeline([node('n1', 'U1', null), node('n2', 'Dated', d(10)), node('n3', 'U2', null)]),
    )
    expect(texts(a.blocks)).toEqual(['1 January 10 — Dated', '— — U1', '— — U2'])
  })

  it('keeps original order when nothing is dated', () => {
    const a = chrono(timeline([node('n2', 'B', null), node('n1', 'A', null)]))
    expect(texts(a.blocks)).toEqual(['— — B', '— — A'])
  })

  it('omits the appendix when the timeline has no nodes', () => {
    const o = opts((a) => (a.chronology = { on: true, timelineId: 'tl' }))
    expect(buildAppendices(input({ timelines: [timeline([])] }), o, both)).toEqual([])
  })
})
