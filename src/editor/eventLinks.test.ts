// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BlockIds } from './blockIds'
import { EventLinks, linkedBlocks, selectedBlockIds } from './eventLinks'

const p = (id: string, text: string): JSONContent => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
})

const editors: Editor[] = []
function make(content: JSONContent[], info = () => null as { count: number; broken: boolean } | null) {
  const e = new Editor({
    extensions: [StarterKit.configure({ trailingNode: false }), BlockIds, EventLinks.configure({ info })],
    content: { type: 'doc', content },
  })
  editors.push(e)
  return e
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

// Start of the n-th top-level block's text (pos of block + 1 for plain paragraphs).
function textStart(e: Editor, index: number): number {
  let pos = 0
  for (let i = 0; i < index; i++) pos += e.state.doc.child(i).nodeSize
  return pos + 1
}

describe('selectedBlockIds', () => {
  const doc = [
    p('a', 'one'),
    { type: 'heading', attrs: { id: 'h', level: 2 }, content: [{ type: 'text', text: 'two' }] },
    {
      type: 'bulletList',
      content: [{ type: 'listItem', attrs: { id: 'li' }, content: [p('lp', 'item')] }],
    },
    p('b', 'three'),
  ]

  it('cursor gives its block', () => {
    const e = make(doc)
    e.commands.setTextSelection(textStart(e, 0) + 1)
    expect(selectedBlockIds(e.state)).toEqual(['a'])
  })

  it('range gives every paragraph and heading touched, list items by paragraph id', () => {
    const e = make(doc)
    e.commands.setTextSelection({ from: textStart(e, 0) + 1, to: e.state.doc.content.size - 2 })
    expect(selectedBlockIds(e.state)).toEqual(['a', 'h', 'lp', 'b'])
  })

  it('a range ending at the start of the next block does not touch it', () => {
    const e = make(doc)
    e.commands.setTextSelection({ from: textStart(e, 0), to: textStart(e, 1) - 1 })
    expect(selectedBlockIds(e.state)).toEqual(['a'])
  })
})

describe('linkedBlocks', () => {
  it('lists only blocks with link info, with count and broken flag', () => {
    const e = make([p('a', 'x'), p('b', 'y'), p('c', 'z')])
    const info = (id: string) =>
      id === 'a' ? { count: 2, broken: false } : id === 'c' ? { count: 1, broken: true } : null
    const found = linkedBlocks(e.state.doc, info)
    expect(found.map((f) => [f.id, f.count, f.broken])).toEqual([
      ['a', 2, false],
      ['c', 1, true],
    ])
  })
})
