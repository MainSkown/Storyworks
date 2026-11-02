import { describe, expect, it } from 'vitest'
import { buildExportModel, ExportError, type ExportInput } from './build'
import { defaultExportOptions } from './options'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { Scene } from '../project/schemas/scene'

type J = Record<string, unknown>
const text = (t: string, marks?: string[]): J => ({
  type: 'text',
  text: t,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
})
const p = (content: J[] = [], attrs: J = {}): J => ({ type: 'paragraph', attrs, content })
const doc = (...content: J[]): J => ({ type: 'doc', content })

const scene = (id: string, content: J): Scene => ({
  version: 3,
  id,
  title: `Scene ${id}`,
  status: 'draft',
  synopsis: '',
  wordCount: 0,
  content,
  todos: [],
  comments: [],
  links: [],
})
const node = (
  id: string,
  type: ManuscriptNode['type'],
  children: ManuscriptNode[] = [],
): ManuscriptNode => ({ id, type, title: `T-${id}`, children })

function input(content: J, extra: Partial<ExportInput> = {}): ExportInput {
  return {
    meta: { title: 'Book', author: 'Me', language: 'en' },
    manuscript: [node('c1', 'chapter', [node('s1', 'scene')])],
    scenes: { s1: scene('s1', content) },
    readAsset: () => null,
    selectedChapterIds: ['c1'],
    ...extra,
  }
}

const build = (content: J, extra: Partial<ExportInput> = {}) =>
  buildExportModel(input(content, extra), defaultExportOptions())
const blocks = (content: J) => build(content).chapters[0]!.blocks

describe('block mapping', () => {
  it('maps heading levels', () => {
    const b = blocks(
      doc(
        { type: 'heading', attrs: { level: 1 }, content: [text('A')] },
        { type: 'heading', attrs: { level: 3 }, content: [text('B')] },
      ),
    )
    expect(b.map((x) => (x.type === 'heading' ? x.level : 0))).toEqual([1, 3])
  })

  it('maps a paragraph with default left alignment', () => {
    expect(blocks(doc(p([text('Hi')])))).toEqual([
      { type: 'paragraph', runs: [{ text: 'Hi' }], align: 'left' },
    ])
  })

  it.each(['center', 'right', 'justify'])('keeps %s alignment', (a) => {
    const b = blocks(doc(p([text('x')], { textAlign: a })))[0]
    expect(b).toMatchObject({ type: 'paragraph', align: a })
  })

  it('maps unordered and ordered lists', () => {
    const li = (t: string) => ({ type: 'listItem', content: [p([text(t)])] })
    const b = blocks(
      doc(
        { type: 'bulletList', content: [li('a'), li('b')] },
        { type: 'orderedList', content: [li('c')] },
      ),
    )
    expect(b[0]).toMatchObject({
      type: 'list',
      ordered: false,
      items: [[{ text: 'a' }], [{ text: 'b' }]],
    })
    expect(b[1]).toMatchObject({ type: 'list', ordered: true, items: [[{ text: 'c' }]] })
  })

  it('flattens a nested list to a deeper level', () => {
    const inner = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [p([text('inner')])] }],
    }
    const b = blocks(
      doc({
        type: 'bulletList',
        content: [{ type: 'listItem', content: [p([text('outer')]), inner] }],
      }),
    )
    expect(b[0]).toMatchObject({ type: 'list', levels: [0, 1] })
  })

  it('maps a blockquote', () => {
    const b = blocks(
      doc({
        type: 'blockquote',
        attrs: { textAlign: 'center' },
        content: [p([text('q1')]), p([text('q2')])],
      }),
    )
    expect(b).toEqual([
      { type: 'quote', paragraphs: [[{ text: 'q1' }], [{ text: 'q2' }]], align: 'center' },
    ])
  })

  it('maps a scene break', () => {
    expect(blocks(doc({ type: 'sceneBreak' }))).toEqual([{ type: 'sceneBreak' }])
  })

  it('maps an image with its bytes', () => {
    const bytes = new Uint8Array([1, 2])
    const m = build(doc({ type: 'image', attrs: { src: 'assets/x.png' } }), {
      readAsset: (path) => (path === 'assets/x.png' ? bytes : null),
    })
    expect(m.chapters[0]!.blocks).toEqual([{ type: 'image', bytes, path: 'assets/x.png' }])
    expect(m.warnings).toEqual([])
  })

  it('drops empty trailing paragraphs', () => {
    expect(blocks(doc(p([text('a')]), p()))).toHaveLength(1)
  })

  it('ignores block id attributes', () => {
    expect(blocks(doc(p([text('a')], { id: 'b1' })))[0]).not.toHaveProperty('id')
  })
})

describe('inline content', () => {
  it('maps bold, italic and underline marks', () => {
    const b = blocks(doc(p([text('a', ['bold']), text('b', ['italic', 'underline'])])))[0]
    expect(b).toMatchObject({
      runs: [
        { text: 'a', bold: true },
        { text: 'b', italic: true, underline: true },
      ],
    })
  })

  it('drops comment marks but keeps the text', () => {
    const b = blocks(doc(p([text('seen', ['comment'])])))[0]
    expect(b).toMatchObject({ runs: [{ text: 'seen' }] })
    expect((b as { runs: object[] }).runs[0]).not.toHaveProperty('comment')
  })

  it('turns a footnote into a numbered reference and a chapter footnote', () => {
    const fn = { type: 'footnote', content: [text('note')] }
    const c = build(doc(p([text('a'), fn]))).chapters[0]!
    expect(c.blocks[0]).toMatchObject({ runs: [{ text: 'a' }, { footnote: 1 }] })
    expect(c.footnotes).toEqual([{ n: 1, runs: [{ text: 'note' }] }])
  })

  it('numbers footnotes in reading order across scenes', () => {
    const fn = (t: string) => ({ type: 'footnote', content: [text(t)] })
    const m = buildExportModel(
      input(doc(p([fn('one')])), {
        manuscript: [node('c1', 'chapter', [node('s1', 'scene'), node('s2', 'scene')])],
        scenes: {
          s1: scene('s1', doc(p([fn('one')]))),
          s2: scene('s2', doc(p([fn('two')]))),
        },
      }),
      defaultExportOptions(),
    )
    expect(m.chapters[0]!.footnotes.map((f) => f.n)).toEqual([1, 2])
  })

  it('restarts footnote numbering in each chapter', () => {
    const fn = { type: 'footnote', content: [text('n')] }
    const m = buildExportModel(
      input(doc(), {
        manuscript: [
          node('c1', 'chapter', [node('s1', 'scene')]),
          node('c2', 'chapter', [node('s2', 'scene')]),
        ],
        scenes: { s1: scene('s1', doc(p([fn]))), s2: scene('s2', doc(p([fn]))) },
        selectedChapterIds: ['c1', 'c2'],
      }),
      defaultExportOptions(),
    )
    expect(m.chapters.map((c) => c.footnotes.map((f) => f.n))).toEqual([[1], [1]])
  })
})

describe('structure', () => {
  const two = (selected: string[]) =>
    buildExportModel(
      input(doc(), {
        manuscript: [
          node('c1', 'chapter', [node('s1', 'scene')]),
          node('c2', 'chapter', [node('s2', 'scene')]),
          node('c3', 'chapter', [node('s3', 'scene')]),
        ],
        scenes: {
          s1: scene('s1', doc(p([text('1')]))),
          s2: scene('s2', doc(p([text('2')]))),
          s3: scene('s3', doc(p([text('3')]))),
        },
        selectedChapterIds: selected,
      }),
      defaultExportOptions(),
    )

  it('exports only selected chapters', () => {
    expect(two(['c3', 'c1']).chapters.map((c) => c.id)).toEqual(['c1', 'c3'])
  })

  it('uses the manifest order, not the selection order', () => {
    expect(two(['c3', 'c2']).chapters.map((c) => c.id)).toEqual(['c2', 'c3'])
  })

  it('sets partTitle on the first exported chapter of each part only', () => {
    const m = buildExportModel(
      input(doc(), {
        manuscript: [
          node('p1', 'part', [
            node('c1', 'chapter', [node('s1', 'scene')]),
            node('c2', 'chapter', [node('s2', 'scene')]),
          ]),
          node('c3', 'chapter', [node('s3', 'scene')]),
        ],
        scenes: { s1: scene('s1', doc()), s2: scene('s2', doc()), s3: scene('s3', doc()) },
        selectedChapterIds: ['c2', 'c1', 'c3'],
      }),
      defaultExportOptions(),
    )
    expect(m.chapters.map((c) => c.partTitle)).toEqual(['T-p1', undefined, undefined])
  })

  it('starts the part title at the first selected chapter of the part', () => {
    const m = buildExportModel(
      input(doc(), {
        manuscript: [
          node('p1', 'part', [
            node('c1', 'chapter', [node('s1', 'scene')]),
            node('c2', 'chapter', [node('s2', 'scene')]),
          ]),
        ],
        scenes: { s1: scene('s1', doc()), s2: scene('s2', doc()) },
        selectedChapterIds: ['c2'],
      }),
      defaultExportOptions(),
    )
    expect(m.chapters[0]).toMatchObject({ id: 'c2', partTitle: 'T-p1' })
  })

  it('joins scenes with a scene break and prints no scene titles', () => {
    const m = buildExportModel(
      input(doc(), {
        manuscript: [node('c1', 'chapter', [node('s1', 'scene'), node('s2', 'scene')])],
        scenes: { s1: scene('s1', doc(p([text('a')]))), s2: scene('s2', doc(p([text('b')]))) },
      }),
      defaultExportOptions(),
    )
    expect(m.chapters[0]!.blocks.map((b) => b.type)).toEqual([
      'paragraph',
      'sceneBreak',
      'paragraph',
    ])
  })

  it('carries meta and options into the model', () => {
    const o = defaultExportOptions()
    const m = buildExportModel(input(doc()), o)
    expect(m.meta).toEqual({ title: 'Book', author: 'Me', language: 'en' })
    expect(m.options).toBe(o)
    expect(m.appendices).toEqual([])
  })
})

describe('warnings and errors', () => {
  it('records a missing image and keeps the block', () => {
    const m = build(doc({ type: 'image', attrs: { src: 'assets/gone.png' } }))
    expect(m.chapters[0]!.blocks[0]).toMatchObject({
      type: 'image',
      bytes: null,
      path: 'assets/gone.png',
    })
    expect(m.warnings).toEqual([{ kind: 'missingImage', detail: 'assets/gone.png' }])
  })

  it('skips an unknown node with a warning', () => {
    const m = build(doc({ type: 'mystery' }, p([text('ok')])))
    expect(m.chapters[0]!.blocks).toHaveLength(1)
    expect(m.warnings).toEqual([{ kind: 'unknownNode', detail: 'mystery' }])
  })

  it('throws nothingSelected for an empty selection', () => {
    expect(() => build(doc(), { selectedChapterIds: [] })).toThrow(ExportError)
    expect(() => build(doc(), { selectedChapterIds: [] })).toThrow(/nothingSelected/)
  })

  it('throws nothingSelected when the selection matches no chapter', () => {
    expect(() => build(doc(), { selectedChapterIds: ['nope'] })).toThrow(/nothingSelected/)
  })

  it('throws sceneMissing with the scene id', () => {
    try {
      build(doc(), { scenes: {} })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ExportError)
      expect(e).toMatchObject({ code: 'sceneMissing', detail: 's1' })
    }
  })

  it('does not require scenes of unselected chapters', () => {
    const m = buildExportModel(
      input(doc(), {
        manuscript: [
          node('c1', 'chapter', [node('s1', 'scene')]),
          node('c2', 'chapter', [node('s2', 'scene')]),
        ],
        scenes: { s1: scene('s1', doc()) },
      }),
      defaultExportOptions(),
    )
    expect(m.chapters).toHaveLength(1)
  })
})
