// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { editorKinds } from '../../editor/kinds'
import { formatLineId } from '../../editor/game/lineIds'
import { docsEqual, toEditorContent } from './linesDoc'

const editors: Editor[] = []
let counter = 100
const make = (content: JSONContent): Editor => {
  const e = new Editor({
    extensions: editorKinds.game!.extensions({ allocateLineId: () => formatLineId(++counter) }),
    content,
  })
  editors.push(e)
  return e
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

const line = (text: string, id: string, lineId: string): JSONContent => ({
  type: 'line',
  attrs: { id, lineId, kind: 'speech', speakerId: null, speakerName: 'Ann' },
  content: [{ type: 'text', text }],
})

describe('lines body in the editor', () => {
  it('keeps block ids, line ids and speakers across remounting', () => {
    const doc = { type: 'doc', content: [line('a', 'b1', 'L000001'), line('b', 'b2', 'L000002')] }
    const first = make(doc).getJSON()
    const again = make(toEditorContent(first) as JSONContent).getJSON()
    expect(again).toEqual(doc)
    expect(counter).toBe(100)
  })

  it('an empty body becomes one empty line that gets a fresh line id', () => {
    const e = make(toEditorContent({ type: 'doc', content: [] }) as JSONContent)
    const lines = e.getJSON().content ?? []
    expect(lines).toHaveLength(1)
    expect(lines[0]!.attrs!.lineId).toMatch(/^L\d{6,}$/)
  })

  it('compares docs by content', () => {
    expect(docsEqual({ a: 1 }, { a: 1 })).toBe(true)
    expect(docsEqual({ a: 1 }, { a: 2 })).toBe(false)
  })
})
