// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { editorKinds } from '../kinds'
import { formatLineId, maxLineNumber, parseLineId } from './lineIds'

describe('line id helpers', () => {
  it('formats with at least six digits and parses back', () => {
    expect(formatLineId(1)).toBe('L000001')
    expect(formatLineId(123)).toBe('L000123')
    expect(formatLineId(1234567)).toBe('L1234567')
    expect(parseLineId('L000123')).toBe(123)
    expect(parseLineId('L1234567')).toBe(1234567)
  })

  it.each([['x'], ['L12'], ['l000001'], [''], [5], [null]])('does not parse %j', (v) => {
    expect(parseLineId(v)).toBeNull()
  })

  it('maxLineNumber finds the highest id, 0 without lines', () => {
    const line = (lineId: string) => ({ type: 'line', attrs: { lineId } })
    expect(
      maxLineNumber({ type: 'doc', content: [line('L000002'), line('L000009'), line('L000004')] }),
    ).toBe(9)
    expect(maxLineNumber({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(0)
    expect(maxLineNumber({ type: 'doc' })).toBe(0)
  })

  it('5000 lines are scanned quickly', () => {
    const content = Array.from({ length: 5000 }, (_, i) => ({
      type: 'line',
      attrs: { lineId: formatLineId(i + 1) },
    }))
    const t = performance.now()
    expect(maxLineNumber({ type: 'doc', content })).toBe(5000)
    expect(performance.now() - t).toBeLessThan(100)
  })
})

const editors: Editor[] = []
let counter = 0
const allocate = () => formatLineId(++counter)

function makeEditor(content: JSONContent, start = 0): Editor {
  counter = start
  const editor = new Editor({
    extensions: editorKinds.game!.extensions({ allocateLineId: allocate }),
    content,
  })
  editors.push(editor)
  return editor
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

const line = (
  text: string,
  lineId: string | null,
  id = `b-${lineId}`,
  extra = {},
): JSONContent => ({
  type: 'line',
  attrs: { id, lineId, speakerId: null, speakerName: null, ...extra },
  ...(text ? { content: [{ type: 'text', text }] } : {}),
})
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })

const lines = (e: Editor) =>
  (e.getJSON().content ?? []).map((n) => ({
    text: (n.content ?? []).map((c) => (c as { text?: string }).text ?? '').join(''),
    lineId: n.attrs?.lineId as string | null,
    id: n.attrs?.id as string,
  }))

/** Position at offset `at` inside block `i`. */
function cursorIn(e: Editor, i: number, at: number): void {
  let pos = 0
  e.state.doc.forEach((node, offset, index) => {
    if (index === i) pos = offset + 1 + at
  })
  e.commands.setTextSelection(pos)
}

describe('line ids in the editor', () => {
  it('keeps the ids of loaded lines and issues nothing', () => {
    const e = makeEditor(doc(line('a', 'L000001'), line('b', 'L000002')), 2)
    expect(lines(e).map((l) => l.lineId)).toEqual(['L000001', 'L000002'])
    expect(counter).toBe(2)
  })

  it('gives a loaded line without an id the next number', () => {
    const e = makeEditor(doc(line('a', 'L000001'), line('b', null)), 1)
    expect(lines(e).map((l) => l.lineId)).toEqual(['L000001', 'L000002'])
  })

  it('an empty doc on mount issues no ids', () => {
    makeEditor(doc(), 0)
    expect(counter).toBe(0)
  })

  it('no ids are issued while the editor is not ready, and none are lost afterwards', () => {
    counter = 0
    let ready = false
    const e = new Editor({
      extensions: editorKinds.game!.extensions({
        allocateLineId: allocate,
        lineIdsReady: () => ready,
      }),
      content: doc(line('a', null)),
    })
    editors.push(e)
    expect(counter).toBe(0)
    ready = true
    cursorIn(e, 0, 1)
    e.commands.insertContent('x')
    expect(lines(e)[0].lineId).toBe('L000001')
  })

  it('splitting keeps the id on the first half and issues a new one for the second', () => {
    const e = makeEditor(doc(line('hello world', 'L000001')), 1)
    cursorIn(e, 0, 5)
    e.commands.splitBlock()
    const l = lines(e)
    expect(l.map((x) => x.text)).toEqual(['hello', ' world'])
    expect(l[0].lineId).toBe('L000001')
    expect(l[1].lineId).toBe('L000002')
    expect(l[1].id).not.toBe(l[0].id)
  })

  it('joining keeps the first id; the other is retired, never reused', () => {
    const e = makeEditor(doc(line('a', 'L000001'), line('b', 'L000002')), 2)
    cursorIn(e, 1, 0)
    e.commands.joinBackward()
    expect(lines(e)).toHaveLength(1)
    expect(lines(e)[0].lineId).toBe('L000001')
    e.commands.splitBlock()
    expect(lines(e)[1].lineId).toBe('L000003')
  })

  it('a pasted copy of a line gets a fresh id; the original keeps its own', () => {
    const e = makeEditor(doc(line('a', 'L000001'), line('b', 'L000002')), 2)
    e.commands.insertContentAt(e.state.doc.content.size, line('a', 'L000001', 'b-copy'))
    const l = lines(e)
    expect(l).toHaveLength(3)
    expect(l[0].lineId).toBe('L000001')
    expect(l[2].lineId).toBe('L000003')
  })

  it('moving a line (delete + insert in one step) keeps its id', () => {
    const e = makeEditor(doc(line('a', 'L000001'), line('b', 'L000002'), line('c', 'L000003')), 3)
    const first = e.state.doc.child(0)
    e.view.dispatch(
      e.state.tr.delete(0, first.nodeSize).insert(e.state.doc.content.size - first.nodeSize, first),
    )
    expect(lines(e).map((l) => l.lineId)).toEqual(['L000002', 'L000003', 'L000001'])
    expect(counter).toBe(3)
  })

  it('a new line after deleting the last one gets a higher number than the deleted one', () => {
    const e = makeEditor(doc(line('a', 'L000001'), line('b', 'L000002')), 2)
    e.commands.setContent(doc(line('a', 'L000001')))
    cursorIn(e, 0, 1)
    e.commands.splitBlock()
    expect(lines(e)[1].lineId).toBe('L000003')
  })

  it('editing text leaves every id untouched', () => {
    const e = makeEditor(doc(line('a', 'L000001'), line('b', 'L000002')), 2)
    cursorIn(e, 0, 1)
    e.commands.insertContent('xyz')
    expect(lines(e).map((l) => l.lineId)).toEqual(['L000001', 'L000002'])
    expect(counter).toBe(2)
  })

  it('a split keeps the speaker on both halves', () => {
    const e = makeEditor(doc(line('hello world', 'L000001', 'b1', { speakerId: 'e1' })), 1)
    cursorIn(e, 0, 5)
    e.commands.splitBlock()
    const attrs = (e.getJSON().content ?? []).map((n) => n.attrs?.speakerId)
    expect(attrs).toEqual(['e1', 'e1'])
  })

  it('block ids stay unique too', () => {
    const e = makeEditor(doc(line('hello world', 'L000001')), 1)
    cursorIn(e, 0, 5)
    e.commands.splitBlock()
    const ids = lines(e).map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('text item editor', () => {
  it('holds paragraphs with block ids and never issues line ids', () => {
    counter = 0
    const e = new Editor({
      extensions: editorKinds.gameText!.extensions({ allocateLineId: allocate }),
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fog.' }] }] },
    })
    editors.push(e)
    e.commands.splitBlock()
    const blocks = e.getJSON().content ?? []
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph'])
    expect(new Set(blocks.map((b) => b.attrs?.id)).size).toBe(2)
    expect(counter).toBe(0)
  })
})
