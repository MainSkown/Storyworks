// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { editorKinds } from '../kinds'
import { ELEMENTS, type ElementType } from './rules'
import { sceneSchema } from '../../project/schemas/scene'

const editors: Editor[] = []

function makeEditor(content: JSONContent = { type: 'doc', content: [] }): Editor {
  const editor = new Editor({ extensions: editorKinds.screenplay!.extensions(), content })
  editors.push(editor)
  return editor
}

afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

const block = (type: ElementType, text = '', id?: string): JSONContent => ({
  type,
  ...(id ? { attrs: { id } } : {}),
  ...(text ? { content: [{ type: 'text', text }] } : {}),
})
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })

function key(editor: Editor, k: string, shiftKey = false): boolean {
  const ev = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })
  return !!editor.view.someProp('handleKeyDown', (f) => f(editor.view, ev))
}

/** Cursor at the end of block `i`. */
function cursorAtEnd(editor: Editor, i: number): void {
  let pos = 0
  editor.state.doc.forEach((node, offset, index) => {
    if (index === i) pos = offset + node.nodeSize - 1
  })
  editor.commands.setTextSelection(pos)
}

const blocks = (editor: Editor) =>
  (editor.getJSON().content ?? []).map((n) => ({
    type: n.type as string,
    text: (n.content ?? []).map((c) => (c as { text?: string }).text ?? '').join(''),
    id: n.attrs?.id as string,
  }))

const types = (editor: Editor) => blocks(editor).map((b) => b.type)

describe('Enter', () => {
  it.each([
    ['sceneHeading', 'action'],
    ['action', 'action'],
    ['character', 'dialogue'],
    ['dialogue', 'action'],
    ['parenthetical', 'dialogue'],
    ['transition', 'sceneHeading'],
  ] as const)('at the end of %s starts %s', (from, to) => {
    const e = makeEditor(doc(block(from, 'text')))
    cursorAtEnd(e, 0)
    expect(key(e, 'Enter')).toBe(true)
    expect(types(e)).toEqual([from, to])
    // The cursor is in the new block.
    expect(e.state.selection.$from.parent.type.name).toBe(to)
  })

  it('in the middle of a block splits it and keeps the type', () => {
    const e = makeEditor(doc(block('dialogue', 'abcd')))
    e.commands.setTextSelection(3)
    key(e, 'Enter')
    expect(blocks(e).map((b) => [b.type, b.text])).toEqual([
      ['dialogue', 'ab'],
      ['dialogue', 'cd'],
    ])
  })

  it('on an empty block switches its type instead of adding a block', () => {
    const e = makeEditor(doc(block('character', 'ANNA'), block('dialogue')))
    cursorAtEnd(e, 1)
    key(e, 'Enter')
    expect(types(e)).toEqual(['character', 'character'])
  })

  it('an empty block keeps its id when its type changes', () => {
    const e = makeEditor(doc(block('dialogue', '', 'keep')))
    cursorAtEnd(e, 0)
    key(e, 'Enter')
    expect(blocks(e)).toMatchObject([{ type: 'character', id: 'keep' }])
  })
})

describe('Tab and Shift+Tab', () => {
  it('Tab walks through every element and wraps; Shift+Tab walks back', () => {
    const e = makeEditor(doc(block('sceneHeading', 'x')))
    cursorAtEnd(e, 0)
    const seen: string[] = []
    for (let i = 0; i < ELEMENTS.length; i++) {
      expect(key(e, 'Tab')).toBe(true)
      seen.push(types(e)[0]!)
    }
    expect(seen).toEqual([...ELEMENTS.slice(1), 'sceneHeading'])
    key(e, 'Tab', true)
    expect(types(e)).toEqual(['transition'])
  })

  it('changes only the block with the cursor and keeps its text and id', () => {
    const e = makeEditor(doc(block('action', 'one', 'a'), block('action', 'two', 'b')))
    cursorAtEnd(e, 1)
    key(e, 'Tab')
    expect(blocks(e)).toEqual([
      { type: 'action', text: 'one', id: 'a' },
      { type: 'character', text: 'two', id: 'b' },
    ])
  })
})

describe('setElement command', () => {
  it('sets the type of the block with the cursor', () => {
    const e = makeEditor(doc(block('action', 'x', 'a')))
    cursorAtEnd(e, 0)
    expect(e.commands.setElement('transition')).toBe(true)
    expect(blocks(e)).toEqual([{ type: 'transition', text: 'x', id: 'a' }])
  })
})

describe('block ids', () => {
  it('an empty scene opens with one action block that has an id', () => {
    const e = makeEditor()
    const b = blocks(e)
    expect(b).toHaveLength(1)
    expect(b[0]!.type).toBe('action')
    expect(b[0]!.id).toBeTruthy()
  })

  it('blocks without an id get unique ones; existing ids stay', () => {
    const e = makeEditor(
      doc(block('action', 'a', 'keep'), block('dialogue', 'b'), block('action', 'c')),
    )
    const ids = blocks(e).map((b) => b.id)
    expect(ids[0]).toBe('keep')
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(3)
  })

  it('untouched blocks keep their ids across splits, merges and new lines', () => {
    const e = makeEditor(
      doc(
        block('sceneHeading', 'INT. KITCHEN', 'h'),
        block('action', 'abcd', 'a'),
        block('character', 'ANNA', 'c'),
      ),
    )
    e.commands.setTextSelection(e.state.doc.child(0).nodeSize + 3) // inside "abcd"
    key(e, 'Enter')
    cursorAtEnd(e, 3)
    key(e, 'Enter')
    const after = blocks(e)
    expect(after.map((b) => b.id).slice(0, 2)).toEqual(['h', 'a'])
    expect(after.find((b) => b.type === 'character' && b.text === 'ANNA')!.id).toBe('c')
    const ids = after.map((b) => b.id)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    // Merge the split halves back with Backspace at the start of the second half.
    e.commands.setTextSelection(e.state.doc.child(0).nodeSize + 2 + 1 + 1)
    key(e, 'Backspace')
    const merged = blocks(e)
    expect(merged.find((b) => b.id === 'h')).toBeTruthy()
    expect(merged.find((b) => b.id === 'c')).toBeTruthy()
    expect(new Set(merged.map((b) => b.id)).size).toBe(merged.length)
  })

  it('pasted plain text becomes action blocks with fresh unique ids', () => {
    const e = makeEditor(doc(block('character', 'ANNA', 'c')))
    cursorAtEnd(e, 0)
    // jsdom has no ClipboardEvent: run the plain-text parser and paste its slice.
    const slice = e.view.someProp('clipboardTextParser', (f) =>
      f('first line\nsecond line', e.state.selection.$from, false, e.view),
    )!
    e.view.dispatch(e.state.tr.replaceSelection(slice).setMeta('paste', true))
    const b = blocks(e)
    expect(b.map((x) => x.type)).toContain('action')
    expect(b.every((x) => ELEMENTS.includes(x.type as ElementType))).toBe(true)
    expect(b.map((x) => x.text).join('|')).toContain('first line')
    expect(b.map((x) => x.text).join('|')).toContain('second line')
    expect(b.find((x) => x.text.includes('first'))!.type).not.toBe('paragraph')
    expect(new Set(b.map((x) => x.id)).size).toBe(b.length)
    expect(b.every((x) => x.id)).toBe(true)
  })
})

describe('saving', () => {
  it('the saved scene contains typed blocks with ids and passes the scene schema', () => {
    const e = makeEditor(
      doc(
        block('sceneHeading', 'INT. ROOM - DAY'),
        block('character', 'ANNA'),
        block('dialogue', 'Hi.'),
      ),
    )
    const content = e.getJSON()
    const r = sceneSchema.safeParse({ version: 3, id: 's', title: 'S', content })
    expect(r.success).toBe(true)
    const saved = content.content as JSONContent[]
    expect(saved.map((n) => n.type)).toEqual(['sceneHeading', 'character', 'dialogue'])
    expect(saved.every((n) => typeof n.attrs?.id === 'string' && n.attrs.id !== '')).toBe(true)
  })
})

describe('kinds', () => {
  it('the book editor has no script elements and keeps its toolbar', () => {
    const book = new Editor({ extensions: editorKinds.book!.extensions(), content: '<p>x</p>' })
    editors.push(book)
    expect(book.schema.nodes.sceneHeading).toBeUndefined()
    expect(book.schema.nodes.paragraph).toBeDefined()
    expect(editorKinds.book!.toolbar.some((i) => i.id === 'h1')).toBe(true)
  })

  it('the screenplay toolbar has no book-only items', () => {
    const ids = editorKinds.screenplay!.toolbar.map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['element', 'comment', 'eventLink', 'undo', 'redo']))
    for (const bookOnly of [
      'h1',
      'h2',
      'h3',
      'bold',
      'bulletList',
      'blockquote',
      'footnote',
      'image',
      'sceneBreak',
    ])
      expect(ids).not.toContain(bookOnly)
  })
})
