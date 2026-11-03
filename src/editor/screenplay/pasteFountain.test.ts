// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { editorKinds } from '../kinds'
import { fountainElements } from './pasteFountain'

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})
function paste(text: string, content: JSONContent = { type: 'doc', content: [] }): Editor {
  const e = new Editor({ extensions: editorKinds.screenplay!.extensions(), content })
  editors.push(e)
  e.commands.focus('end')
  // The real paste path (parseFromClipboard re-opens parsed slices); jsdom has no ClipboardEvent.
  const ev = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'clipboardData', {
    value: { types: ['text/plain'], getData: (t: string) => (t === 'text/plain' ? text : '') },
  })
  e.view.dom.dispatchEvent(ev)
  return e
}
const blocks = (e: Editor) =>
  (e.getJSON().content ?? []).map((n) => ({
    type: n.type as string,
    text: (n.content ?? []).map((c) => (c as { text?: string }).text ?? '').join(''),
    id: n.attrs?.id as string,
  }))

const SCRIPT = 'INT. CAFE - DAY\n\nAnna waits.\n\nANNA\n(quietly)\nHello.\n\nCUT TO:\n'

describe('fountainElements', () => {
  it('leaves plain text alone', () => {
    expect(fountainElements('just a line')).toBeNull()
    expect(fountainElements('first line\nsecond line')).toBeNull()
    expect(fountainElements('THE END')).toBeNull()
  })
  it('recognises a scene heading', () => {
    expect(fountainElements('INT. CAFE - DAY\n\nShe waits.')?.map((e) => e.type)).toEqual(['sceneHeading', 'action'])
  })
  it('recognises a cue followed by dialogue', () => {
    expect(fountainElements('ANNA\nHello.')?.map((e) => e.type)).toEqual(['character', 'dialogue'])
  })
  it('ignores sections and notes but keeps the elements', () => {
    const els = fountainElements('# Act one\n\nINT. A - DAY\n\n[[note]]Text here.')!
    expect(els.map((e) => e.type)).toEqual(['sceneHeading', 'action'])
    expect(els[1]!.text).toBe('Text here.')
  })
})

describe('pasting Fountain text', () => {
  it('becomes typed element blocks with fresh unique ids', () => {
    const b = blocks(paste(SCRIPT))
    expect(b.map((x) => x.type)).toEqual(['sceneHeading', 'action', 'character', 'parenthetical', 'dialogue', 'transition'])
    expect(b.find((x) => x.type === 'sceneHeading')!.text).toBe('INT. CAFE - DAY')
    expect(new Set(b.map((x) => x.id)).size).toBe(b.length)
    expect(b.every((x) => x.id)).toBe(true)
  })

  it('keeps the blocks that were already there', () => {
    const b = blocks(paste(SCRIPT, { type: 'doc', content: [{ type: 'action', attrs: { id: 'keep' }, content: [{ type: 'text', text: 'Before.' }] }] }))
    expect(b[0]).toMatchObject({ type: 'action', text: 'Before.', id: 'keep' })
    expect(b[1]).toMatchObject({ type: 'sceneHeading', text: 'INT. CAFE - DAY' })
  })

  it('plain text still becomes action blocks', () => {
    const b = blocks(paste('one\ntwo'))
    expect(b.map((x) => x.type)).toEqual(['action', 'action'])
  })
})
