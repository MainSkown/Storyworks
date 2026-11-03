// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { editorKinds } from '../kinds'
import { formatLineId } from './lineIds'

const editors: Editor[] = []
let counter = 0
const picks: number[] = []
const chips: number[] = []

function makeEditor(content: JSONContent, names: Record<string, string> = { e1: 'Anna' }): Editor {
  counter = 10
  picks.length = 0
  chips.length = 0
  const editor = new Editor({
    extensions: editorKinds.game!.extensions({
      allocateLineId: () => formatLineId(++counter),
      speakers: {
        label: (a) =>
          a.speakerId
            ? names[a.speakerId]
              ? { text: names[a.speakerId]!, state: 'entry', title: 'Speaker' }
              : { text: 'Deleted', state: 'broken', title: 'Deleted' }
            : a.speakerName
              ? { text: a.speakerName, state: 'name', title: 'Not in codex' }
              : { text: '—', state: 'none', title: 'Narration' },
        onPick: (pos) => picks.push(pos),
        onChip: (pos) => chips.push(pos),
      },
    }),
    content,
  })
  editors.push(editor)
  return editor
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

const line = (text: string, n: number, extra: Record<string, unknown> = {}): JSONContent => ({
  type: 'line',
  attrs: { id: `b${n}`, lineId: formatLineId(n), speakerId: null, speakerName: null, ...extra },
  ...(text ? { content: [{ type: 'text', text }] } : {}),
})
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })
const attrsOf = (e: Editor) =>
  (e.getJSON().content ?? []).map((n) => n.attrs as Record<string, unknown>)

function key(e: Editor, k: string, shiftKey = false): boolean {
  const ev = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })
  return !!e.view.someProp('handleKeyDown', (f) => f(e.view, ev))
}
function cursorIn(e: Editor, i: number, at: number): void {
  let pos = 0
  e.state.doc.forEach((_n, offset, index) => {
    if (index === i) pos = offset + 1 + at
  })
  e.commands.setTextSelection(pos)
}

describe('speaker chips', () => {
  it('draws one chip per line with the label state', () => {
    const e = makeEditor(
      doc(
        line('a', 1),
        line('b', 2, { speakerId: 'e1' }),
        line('c', 3, { speakerId: 'zz' }),
        line('d', 4, { speakerName: 'Old Man' }),
      ),
    )
    const chipEls = [...e.view.dom.querySelectorAll('.speaker-chip')]
    expect(chipEls.map((c) => c.textContent)).toEqual(['—', 'Anna', 'Deleted', 'Old Man'])
    expect(chipEls.map((c) => c.getAttribute('data-state'))).toEqual([
      'none',
      'entry',
      'broken',
      'name',
    ])
  })

  it('a chip is not part of the text', () => {
    const e = makeEditor(doc(line('hello', 1, { speakerId: 'e1' })))
    expect(e.getText()).toBe('hello')
  })

  it('redraws when asked to refresh (codex renamed)', () => {
    const names = { e1: 'Anna' }
    const e = makeEditor(doc(line('a', 1, { speakerId: 'e1' })), names)
    names.e1 = 'Hanna'
    e.view.dispatch(e.state.tr.setMeta('speakers', true))
    expect(e.view.dom.querySelector('.speaker-chip')?.textContent).toBe('Hanna')
  })

  it('clicking a chip reports the line', () => {
    const e = makeEditor(doc(line('a', 1), line('b', 2)))
    ;(e.view.dom.querySelectorAll('.speaker-chip')[1] as HTMLElement).click()
    expect(chips).toEqual([e.state.doc.child(0).nodeSize])
  })
})

describe('setSpeaker', () => {
  it('sets a codex speaker and clears the plain name', () => {
    const e = makeEditor(doc(line('a', 1, { speakerName: 'Bob' })))
    e.commands.setSpeaker(0, { speakerId: 'e1' })
    expect(attrsOf(e)[0]).toMatchObject({ speakerId: 'e1', speakerName: null })
  })

  it('sets a plain name and clears the codex speaker', () => {
    const e = makeEditor(doc(line('a', 1, { speakerId: 'e1' })))
    e.commands.setSpeaker(0, { speakerName: 'Bob' })
    expect(attrsOf(e)[0]).toMatchObject({ speakerId: null, speakerName: 'Bob' })
  })

  it('null makes the line narration; ids and text stay', () => {
    const e = makeEditor(doc(line('a', 1, { speakerId: 'e1' })))
    e.commands.setSpeaker(0, null)
    expect(attrsOf(e)[0]).toMatchObject({
      speakerId: null,
      speakerName: null,
      lineId: 'L000001',
      id: 'b1',
    })
    expect(e.getText()).toBe('a')
  })

  it('does nothing at a position that is not a line', () => {
    const e = makeEditor(doc(line('a', 1)))
    expect(e.commands.setSpeaker(1, { speakerId: 'e1' })).toBe(false)
  })
})

describe('linkSpeakerName', () => {
  it('turns every line with that plain name into the codex speaker, ignoring case', () => {
    const e = makeEditor(
      doc(
        line('a', 1, { speakerName: 'Bob' }),
        line('b', 2, { speakerName: 'bob' }),
        line('c', 3, { speakerName: 'Eve' }),
        line('d', 4),
      ),
    )
    e.commands.linkSpeakerName('Bob', 'e9')
    expect(attrsOf(e).map((a) => [a.speakerId, a.speakerName])).toEqual([
      ['e9', null],
      ['e9', null],
      [null, 'Eve'],
      [null, null],
    ])
  })
})

describe('keys', () => {
  it('Enter at the end of a line starts a narration line', () => {
    const e = makeEditor(doc(line('hello', 1, { speakerId: 'e1' })))
    cursorIn(e, 0, 5)
    expect(key(e, 'Enter')).toBe(true)
    const a = attrsOf(e)
    expect(a).toHaveLength(2)
    expect(a[0]).toMatchObject({ speakerId: 'e1', lineId: 'L000001' })
    expect(a[1]).toMatchObject({ speakerId: null, speakerName: null })
    expect(a[1].lineId).toBe('L000011')
    expect(e.state.selection.$from.parent).toBe(e.state.doc.child(1))
  })

  it('Enter in the middle splits and keeps the speaker on both halves', () => {
    const e = makeEditor(doc(line('hello world', 1, { speakerId: 'e1' })))
    cursorIn(e, 0, 5)
    e.commands.splitBlock()
    expect(attrsOf(e).map((a) => a.speakerId)).toEqual(['e1', 'e1'])
  })

  it('Tab at the start of a line asks for the speaker picker', () => {
    const e = makeEditor(doc(line('a', 1), line('b', 2)))
    cursorIn(e, 1, 0)
    expect(key(e, 'Tab')).toBe(true)
    expect(picks).toEqual([e.state.doc.child(0).nodeSize])
  })

  it('Tab elsewhere in a line is left alone, so focus can leave the editor', () => {
    const e = makeEditor(doc(line('abc', 1)))
    cursorIn(e, 0, 2)
    expect(key(e, 'Tab')).toBe(false)
    expect(picks).toEqual([])
  })

  it('Shift+Tab is never captured', () => {
    const e = makeEditor(doc(line('abc', 1)))
    cursorIn(e, 0, 0)
    expect(key(e, 'Tab', true)).toBe(false)
  })
})

describe('line kinds in the editor', () => {
  it('a text line draws no chip', () => {
    const e = makeEditor(doc(line('a', 1), line('Dusk falls.', 2, { kind: 'text' })))
    expect(e.view.dom.querySelectorAll('.speaker-chip')).toHaveLength(1)
    expect((e.view.dom.querySelectorAll('.game-line')[1] as HTMLElement).dataset.kind).toBe('text')
  })

  it('setLineKind text clears the speaker; speech keeps the line as it is', () => {
    const e = makeEditor(doc(line('a', 1, { speakerId: 'e1' })))
    e.commands.setLineKind(0, 'text')
    expect(attrsOf(e)[0]).toMatchObject({
      kind: 'text',
      speakerId: null,
      speakerName: null,
      lineId: 'L000001',
    })
    e.commands.setLineKind(0, 'speech')
    expect(attrsOf(e)[0]).toMatchObject({ kind: 'speech', speakerId: null })
  })

  it('choosing a speaker on a text line makes it a speech line', () => {
    const e = makeEditor(doc(line('a', 1, { kind: 'text' })))
    e.commands.setSpeaker(0, { speakerId: 'e1' })
    expect(attrsOf(e)[0]).toMatchObject({ kind: 'speech', speakerId: 'e1' })
  })

  it('Enter at the end of a text line starts another text line', () => {
    const e = makeEditor(doc(line('Dusk falls.', 1, { kind: 'text' })))
    cursorIn(e, 0, 11)
    expect(key(e, 'Enter')).toBe(true)
    expect(attrsOf(e).map((a) => a.kind)).toEqual(['text', 'text'])
  })

  it('Tab at the start of a text line still opens the picker', () => {
    const e = makeEditor(doc(line('Dusk', 1, { kind: 'text' })))
    cursorIn(e, 0, 0)
    expect(key(e, 'Tab')).toBe(true)
    expect(picks).toHaveLength(1)
  })

  it('splitting a text line keeps the kind on both halves', () => {
    const e = makeEditor(doc(line('Dusk falls', 1, { kind: 'text' })))
    cursorIn(e, 0, 4)
    e.commands.splitBlock()
    expect(attrsOf(e).map((a) => a.kind)).toEqual(['text', 'text'])
  })
})
