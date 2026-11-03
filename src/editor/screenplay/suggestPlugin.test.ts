// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { Document } from '@tiptap/extension-document'
import { Text } from '@tiptap/extension-text'
import { ScreenplayNodes, ScreenplayElements } from './extension'
import { ScreenplaySuggest, type SuggestInfo } from './suggestPlugin'
import type { SuggestSource } from './suggest'

const src: SuggestSource = {
  lang: 'en',
  characters: [
    { name: 'Anna', aliases: [] },
    { name: 'Annabel', aliases: [] },
  ],
  places: [{ name: 'Harbour', aliases: [] }],
}

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

function setup(content: JSONContent[]) {
  const seen: (SuggestInfo | null)[] = []
  const onAdd = vi.fn()
  const editor = new Editor({
    extensions: [
      Document,
      Text,
      ...ScreenplayNodes,
      ScreenplayElements,
      ScreenplaySuggest.configure({
        source: () => src,
        onChange: (i) => seen.push(i),
        onAddToCodex: onAdd,
      }),
    ],
    content: { type: 'doc', content },
  })
  editors.push(editor)
  editor.commands.focus('end')
  return { editor, seen, onAdd, last: () => seen[seen.length - 1] }
}

const block = (type: string, text: string): JSONContent => ({
  type,
  content: [{ type: 'text', text }],
})
const texts = (e: Editor) =>
  (e.getJSON().content ?? []).map(
    (n) => `${n.type}:${(n.content?.[0] as { text?: string } | undefined)?.text ?? ''}`,
  )

function key(editor: Editor, k: string, shiftKey = false): boolean {
  const ev = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })
  return !!editor.view.someProp('handleKeyDown', (f) => f(editor.view, ev))
}

describe('suggest plugin', () => {
  it('opens in a character cue and not in action', () => {
    const a = setup([block('character', 'ann')])
    expect(a.last()?.items.map((i) => i.insert)).toEqual(['Anna', 'Annabel'])
    const b = setup([block('action', 'ann')])
    expect(b.last()).toBeNull()
  })

  it('Enter accepts the first suggestion and does not add a block', () => {
    const { editor } = setup([block('character', 'ann')])
    expect(key(editor, 'Enter')).toBe(true)
    expect(texts(editor)).toEqual(['character:Anna'])
  })

  it('arrow keys move the choice; Tab accepts it instead of cycling the element', () => {
    const { editor, last } = setup([block('character', 'ann')])
    expect(key(editor, 'ArrowDown')).toBe(true)
    expect(last()?.index).toBe(1)
    expect(key(editor, 'Tab')).toBe(true)
    expect(texts(editor)).toEqual(['character:Annabel'])
  })

  it('Escape closes it, and typing more opens it again', () => {
    const { editor, last } = setup([block('character', 'ann')])
    expect(key(editor, 'Escape')).toBe(true)
    expect(last()).toBeNull()
    editor.commands.insertContent('a')
    expect(last()?.items.map((i) => i.insert)).toEqual(['Annabel'])
  })

  it('Tab and Enter keep their normal job when nothing is suggested', () => {
    const { editor } = setup([block('character', 'Zed')])
    expect(key(editor, 'Tab')).toBe(true) // element cycle, handled by the screenplay keymap
    expect(texts(editor)[0]).toBe('dialogue:Zed')
  })

  it('an unknown name shows the add hint, which does not capture Enter', () => {
    const { editor, last } = setup([block('character', 'Zed')])
    expect(last()).toMatchObject({ items: [], addName: 'Zed', index: -1 })
    key(editor, 'Enter')
    expect(texts(editor)).toEqual(['character:Zed', 'dialogue:'])
  })

  it('Ctrl+Enter adds the unknown name to the codex; arrows stay free without a list', () => {
    const { editor, onAdd } = setup([block('character', 'Zed')])
    expect(key(editor, 'ArrowDown')).toBe(false)
    const ev = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    expect(editor.view.someProp('handleKeyDown', (f) => f(editor.view, ev))).toBe(true)
    expect(onAdd).toHaveBeenCalledWith('Zed')
  })

  it('with a list, the add option is the last arrow stop', () => {
    const { editor, onAdd } = setup([block('character', 'ann')])
    key(editor, 'ArrowUp')
    key(editor, 'Enter')
    expect(onAdd).toHaveBeenCalledWith('ann')
  })

  it('scene heading: accepting a place continues into times of day', () => {
    const { editor, last } = setup([block('sceneHeading', 'INT. har')])
    key(editor, 'Enter')
    expect(texts(editor)).toEqual(['sceneHeading:INT. Harbour - '])
    expect(last()?.items.map((i) => i.insert)).toContain('NIGHT')
  })

  it('does not open when the cursor is not at the end of the block', () => {
    const { editor, last } = setup([block('character', 'ann')])
    editor.commands.setTextSelection(2)
    expect(last()).toBeNull()
  })

  it('accepting leaves the block id and type alone', () => {
    const { editor } = setup([block('character', 'ann')])
    const id = editor.getJSON().content![0]!.attrs?.id
    key(editor, 'Enter')
    expect(editor.getJSON().content![0]!.attrs?.id).toBe(id)
  })
})
