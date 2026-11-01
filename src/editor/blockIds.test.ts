// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { BlockIds } from './blockIds'

const BLOCK_TYPES = ['paragraph', 'heading', 'blockquote', 'listItem', 'horizontalRule', 'image']

const editors: Editor[] = []

function makeEditor(content: string | JSONContent = ''): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ trailingNode: false }),
      Image.configure({ inline: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      BlockIds,
    ],
    content,
  })
  editors.push(editor)
  return editor
}

afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

function collectIds(node: JSONContent): string[] {
  const own = typeof node.attrs?.id === 'string' ? [node.attrs.id as string] : []
  return [...own, ...(node.content ?? []).flatMap(collectIds)]
}

// Every attrs.id in the doc, in document order. Fails if any block lacks an id,
// so before/after comparisons cannot pass on an empty list.
function allIds(node: JSONContent): string[] {
  const ids = collectIds(node)
  expect(ids.length).toBeGreaterThan(0)
  expect(ids).toHaveLength(blockNodes(node).length)
  return ids
}

function blockNodes(node: JSONContent): JSONContent[] {
  const own = node.type && BLOCK_TYPES.includes(node.type) ? [node] : []
  return [...own, ...(node.content ?? []).flatMap(blockNodes)]
}

function expectUnique(editor: Editor) {
  const ids = allIds(editor.getJSON())
  expect(new Set(ids).size).toBe(ids.length)
}

// First node of the given type whose text equals `text`.
function find(editor: Editor, type: string, text: string) {
  let found: { id: string; pos: number } | undefined
  editor.state.doc.descendants((node, pos) => {
    if (!found && node.type.name === type && node.textContent === text) {
      found = { id: node.attrs.id as string, pos }
    }
  })
  if (!found) throw new Error(`no ${type} with text "${text}"`)
  expect(found.id).toBeTruthy()
  return found
}

const idOf = (editor: Editor, text: string, type = 'paragraph') => find(editor, type, text).id

// Position just inside the start of the textblock, shifted by `offset` characters.
const textPos = (editor: Editor, text: string, offset = 0, type = 'paragraph') =>
  find(editor, type, text).pos + 1 + offset

function typeAt(editor: Editor, pos: number, text: string) {
  editor.view.dispatch(editor.state.tr.insertText(text, pos))
}

describe('assigning ids', () => {
  it('gives every block type an id when loading content without ids', () => {
    const editor = makeEditor(
      '<p>one</p><h2>two</h2><blockquote><p>three</p></blockquote>' +
        '<ul><li><p>four</p></li></ul><hr><img src="a.png">',
    )
    const blocks = blockNodes(editor.getJSON())
    expect(new Set(blocks.map((b) => b.type))).toEqual(new Set(BLOCK_TYPES))
    for (const block of blocks) {
      expect(typeof block.attrs?.id).toBe('string')
      expect(block.attrs?.id).not.toBe('')
    }
  })

  it('gives every block type an id when loading JSON content without ids', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'two' }] },
        { type: 'horizontalRule' },
      ],
    })
    const blocks = blockNodes(editor.getJSON())
    expect(blocks).toHaveLength(3)
    for (const block of blocks) expect(block.attrs?.id).toBeTruthy()
  })

  it('gives ids that are unique across the loaded document', () => {
    const editor = makeEditor('<p>a</p><p>b</p><p>c</p><hr><hr>')
    const ids = allIds(editor.getJSON())
    expect(ids).toHaveLength(5)
    expectUnique(editor)
  })

  it('keeps ids that are already present in loaded content', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'p-keep' }, content: [{ type: 'text', text: 'a' }] },
        { type: 'horizontalRule', attrs: { id: 'hr-keep' } },
      ],
    })
    expect(allIds(editor.getJSON())).toEqual(['p-keep', 'hr-keep'])
  })

  it('replaces a repeated id in loaded content and keeps the first', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'dup' }, content: [{ type: 'text', text: 'first' }] },
        { type: 'paragraph', attrs: { id: 'dup' }, content: [{ type: 'text', text: 'second' }] },
      ],
    })
    expect(idOf(editor, 'first')).toBe('dup')
    expect(idOf(editor, 'second')).not.toBe('dup')
    expectUnique(editor)
  })

  it('gives a newly inserted paragraph an id', () => {
    const editor = makeEditor('<p>a</p>')
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: 'paragraph',
      content: [{ type: 'text', text: 'new' }],
    })
    expect(idOf(editor, 'new')).toBeTruthy()
    expectUnique(editor)
  })

  it('gives a newly inserted heading an id', () => {
    const editor = makeEditor('<p>a</p>')
    editor.commands.insertContentAt(editor.state.doc.content.size, '<h3>title</h3>')
    expect(idOf(editor, 'title', 'heading')).toBeTruthy()
    expectUnique(editor)
  })

  it('gives a newly inserted list item an id', () => {
    const editor = makeEditor('<p>a</p>')
    editor.commands.insertContentAt(editor.state.doc.content.size, '<ul><li><p>item</p></li></ul>')
    expect(idOf(editor, 'item', 'listItem')).toBeTruthy()
    expectUnique(editor)
  })

  it('gives a newly inserted scene break an id', () => {
    const editor = makeEditor('<p>a</p>')
    editor.commands.setHorizontalRule()
    const rules = blockNodes(editor.getJSON()).filter((b) => b.type === 'horizontalRule')
    expect(rules).toHaveLength(1)
    expect(rules[0]!.attrs?.id).toBeTruthy()
  })

  it('gives a newly inserted image an id', () => {
    const editor = makeEditor('<p>a</p>')
    editor.commands.setImage({ src: 'b.png' })
    const images = blockNodes(editor.getJSON()).filter((b) => b.type === 'image')
    expect(images).toHaveLength(1)
    expect(images[0]!.attrs?.id).toBeTruthy()
  })
})

describe('typing', () => {
  const html = '<p>alpha</p><p>beta</p><p>gamma</p>'

  it('keeps all ids when typing inside a paragraph', () => {
    const editor = makeEditor(html)
    const before = allIds(editor.getJSON())
    typeAt(editor, textPos(editor, 'beta', 2), 'XX')
    expect(allIds(editor.getJSON())).toEqual(before)
  })

  it('keeps neighbour ids when typing at the start of the first paragraph', () => {
    const editor = makeEditor(html)
    const before = allIds(editor.getJSON())
    typeAt(editor, textPos(editor, 'alpha'), 'XX')
    expect(allIds(editor.getJSON())).toEqual(before)
  })

  it('keeps neighbour ids when typing at the end of the last paragraph', () => {
    const editor = makeEditor(html)
    const before = allIds(editor.getJSON())
    typeAt(editor, textPos(editor, 'gamma', 5), 'XX')
    expect(allIds(editor.getJSON())).toEqual(before)
  })
})

describe('splitting and joining', () => {
  it('keeps the id on the first half when a paragraph is split', () => {
    const editor = makeEditor('<p>helloworld</p>')
    const original = idOf(editor, 'helloworld')
    editor.commands.setTextSelection(textPos(editor, 'helloworld', 5))
    editor.commands.splitBlock()
    expect(idOf(editor, 'hello')).toBe(original)
  })

  it('gives the second half of a split paragraph a new id', () => {
    const editor = makeEditor('<p>helloworld</p>')
    const original = idOf(editor, 'helloworld')
    editor.commands.setTextSelection(textPos(editor, 'helloworld', 5))
    editor.commands.splitBlock()
    const second = idOf(editor, 'world')
    expect(second).toBeTruthy()
    expect(second).not.toBe(original)
    expectUnique(editor)
  })

  it('leaves other paragraphs untouched when one is split', () => {
    const editor = makeEditor('<p>one</p><p>helloworld</p><p>three</p>')
    const one = idOf(editor, 'one')
    const three = idOf(editor, 'three')
    editor.commands.setTextSelection(textPos(editor, 'helloworld', 5))
    editor.commands.splitBlock()
    expect(idOf(editor, 'one')).toBe(one)
    expect(idOf(editor, 'three')).toBe(three)
  })

  it('keeps the first paragraph id when Backspace joins two paragraphs', () => {
    const editor = makeEditor('<p>hello</p><p>world</p>')
    const first = idOf(editor, 'hello')
    editor.commands.setTextSelection(textPos(editor, 'world'))
    editor.commands.joinBackward()
    expect(editor.state.doc.childCount).toBe(1)
    expect(idOf(editor, 'helloworld')).toBe(first)
    expectUnique(editor)
  })
})

describe('duplicate ids', () => {
  it('gives an inserted block a fresh id when its id already exists', () => {
    const editor = makeEditor('<p>original</p><p>other</p>')
    const original = idOf(editor, 'original')
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: 'paragraph',
      attrs: { id: original },
      content: [{ type: 'text', text: 'copy' }],
    })
    expect(idOf(editor, 'original')).toBe(original)
    expect(idOf(editor, 'copy')).not.toBe(original)
    expectUnique(editor)
  })

  it('gives a copied block a fresh id when the whole block JSON is pasted back in', () => {
    const editor = makeEditor('<p>one</p><p>two</p>')
    const copied = editor.getJSON().content![0]!
    editor.commands.insertContentAt(editor.state.doc.content.size, copied)
    expect(editor.state.doc.childCount).toBe(3)
    expectUnique(editor)
  })

  it('gives fresh ids to every block of a pasted run that repeats existing ids', () => {
    const editor = makeEditor('<p>one</p><hr><p>two</p>')
    const copied = editor.getJSON().content!
    editor.commands.insertContentAt(editor.state.doc.content.size, copied)
    expect(editor.state.doc.childCount).toBe(6)
    expectUnique(editor)
  })

  it('keeps the original ids of the existing blocks when a duplicate is inserted', () => {
    const editor = makeEditor('<p>one</p><p>two</p>')
    const before = allIds(editor.getJSON())
    editor.commands.insertContentAt(editor.state.doc.content.size, editor.getJSON().content![0]!)
    expect(allIds(editor.getJSON()).slice(0, 2)).toEqual(before)
  })
})

describe('undo and redo', () => {
  it('restores the original ids when a split is undone', () => {
    const editor = makeEditor('<p>one</p><p>helloworld</p>')
    const before = allIds(editor.getJSON())
    editor.commands.setTextSelection(textPos(editor, 'helloworld', 5))
    editor.commands.splitBlock()
    editor.commands.undo()
    expect(allIds(editor.getJSON())).toEqual(before)
  })

  it('restores the same ids when a split is redone', () => {
    const editor = makeEditor('<p>helloworld</p>')
    editor.commands.setTextSelection(textPos(editor, 'helloworld', 5))
    editor.commands.splitBlock()
    const afterSplit = allIds(editor.getJSON())
    editor.commands.undo()
    editor.commands.redo()
    expect(allIds(editor.getJSON())).toEqual(afterSplit)
  })

  it('restores the same id when a deleted paragraph is brought back by undo', () => {
    const editor = makeEditor('<p>one</p><p>two</p><p>three</p>')
    const before = allIds(editor.getJSON())
    const { pos } = find(editor, 'paragraph', 'two')
    editor.view.dispatch(editor.state.tr.delete(pos, pos + editor.state.doc.nodeAt(pos)!.nodeSize))
    editor.commands.undo()
    expect(allIds(editor.getJSON())).toEqual(before)
  })

  it('restores the same ids when a join is undone', () => {
    const editor = makeEditor('<p>hello</p><p>world</p>')
    const before = allIds(editor.getJSON())
    editor.commands.setTextSelection(textPos(editor, 'world'))
    editor.commands.joinBackward()
    editor.commands.undo()
    expect(allIds(editor.getJSON())).toEqual(before)
  })
})

describe('moving and deleting', () => {
  const list = '<ul><li><p>A</p></li><li><p>B</p></li><li><p>C</p></li></ul>'

  it('leaves the other list item ids untouched when a sibling is deleted', () => {
    const editor = makeEditor(list)
    const a = idOf(editor, 'A', 'listItem')
    const c = idOf(editor, 'C', 'listItem')
    const { pos } = find(editor, 'listItem', 'B')
    editor.view.dispatch(editor.state.tr.delete(pos, pos + editor.state.doc.nodeAt(pos)!.nodeSize))
    expect(idOf(editor, 'A', 'listItem')).toBe(a)
    expect(idOf(editor, 'C', 'listItem')).toBe(c)
    expectUnique(editor)
  })

  it('leaves the other list item ids untouched when an item is moved up', () => {
    const editor = makeEditor(list)
    const ids = { a: idOf(editor, 'A', 'listItem'), b: idOf(editor, 'B', 'listItem') }
    const c = find(editor, 'listItem', 'C')
    const node = editor.state.doc.nodeAt(c.pos)!
    const aPos = find(editor, 'listItem', 'A').pos
    // Move C before A: delete it, then insert at A's position (unchanged by the delete).
    const tr = editor.state.tr.delete(c.pos, c.pos + node.nodeSize).insert(aPos, node)
    editor.view.dispatch(tr)
    expect(editor.state.doc.firstChild!.child(0).textContent).toBe('C')
    expect(idOf(editor, 'A', 'listItem')).toBe(ids.a)
    expect(idOf(editor, 'B', 'listItem')).toBe(ids.b)
    expectUnique(editor)
  })

  it('keeps the id of a list item that is moved', () => {
    const editor = makeEditor(list)
    const cId = idOf(editor, 'C', 'listItem')
    const c = find(editor, 'listItem', 'C')
    const node = editor.state.doc.nodeAt(c.pos)!
    const aPos = find(editor, 'listItem', 'A').pos
    editor.view.dispatch(editor.state.tr.delete(c.pos, c.pos + node.nodeSize).insert(aPos, node))
    expect(idOf(editor, 'C', 'listItem')).toBe(cId)
  })

  it('keeps ids of other paragraphs when a paragraph is deleted', () => {
    const editor = makeEditor('<p>one</p><p>two</p><p>three</p>')
    const one = idOf(editor, 'one')
    const three = idOf(editor, 'three')
    const { pos } = find(editor, 'paragraph', 'two')
    editor.view.dispatch(editor.state.tr.delete(pos, pos + editor.state.doc.nodeAt(pos)!.nodeSize))
    expect(idOf(editor, 'one')).toBe(one)
    expect(idOf(editor, 'three')).toBe(three)
  })
})

describe('changing a block', () => {
  it('keeps the id when text alignment is set', () => {
    const editor = makeEditor('<p>one</p><p>two</p>')
    const two = idOf(editor, 'two')
    editor.commands.setTextSelection(textPos(editor, 'two'))
    editor.commands.setTextAlign('center')
    expect(editor.getJSON().content![1]!.attrs?.textAlign).toBe('center')
    expect(idOf(editor, 'two')).toBe(two)
  })

  it('keeps the id when a heading level is changed', () => {
    const editor = makeEditor('<h2>title</h2>')
    const id = idOf(editor, 'title', 'heading')
    editor.commands.setTextSelection(textPos(editor, 'title', 0, 'heading'))
    editor.commands.updateAttributes('heading', { level: 3 })
    expect(editor.getJSON().content![0]!.attrs?.level).toBe(3)
    expect(idOf(editor, 'title', 'heading')).toBe(id)
  })

  it('keeps the id when a paragraph is turned into a heading', () => {
    const editor = makeEditor('<p>title</p><p>body</p>')
    const id = idOf(editor, 'title')
    editor.commands.setTextSelection(textPos(editor, 'title'))
    editor.commands.setHeading({ level: 2 })
    expect(idOf(editor, 'title', 'heading')).toBe(id)
    expectUnique(editor)
  })

  it('keeps the id when a heading is turned back into a paragraph', () => {
    const editor = makeEditor('<h2>title</h2>')
    const id = idOf(editor, 'title', 'heading')
    editor.commands.setTextSelection(textPos(editor, 'title', 0, 'heading'))
    editor.commands.setParagraph()
    expect(idOf(editor, 'title')).toBe(id)
  })
})

describe('round trip', () => {
  it('keeps ids when the JSON is loaded into a new editor', () => {
    const first = makeEditor('<p>one</p><h2>two</h2><hr><ul><li><p>three</p></li></ul>')
    const json = first.getJSON()
    const second = makeEditor(json)
    expect(allIds(second.getJSON())).toEqual(allIds(json))
  })

  it('keeps ids when the JSON is set back with setContent', () => {
    const editor = makeEditor('<p>one</p><p>two</p><hr>')
    const json = editor.getJSON()
    editor.commands.setContent('<p>something else</p>')
    editor.commands.setContent(json)
    expect(allIds(editor.getJSON())).toEqual(allIds(json))
  })
})
