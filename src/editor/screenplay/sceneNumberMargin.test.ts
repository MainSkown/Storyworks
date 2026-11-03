// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorKinds } from '../kinds'

function mount(numbers: Map<string, number>) {
  return new Editor({
    element: document.createElement('div'),
    extensions: editorKinds.screenplay!.extensions({ sceneNumbers: () => numbers }),
    content: {
      type: 'doc',
      content: [
        {
          type: 'sceneHeading',
          attrs: { id: 'h1' },
          content: [{ type: 'text', text: 'INT. LAB - DAY' }],
        },
        { type: 'action', attrs: { id: 'a1' }, content: [{ type: 'text', text: 'Rain.' }] },
        {
          type: 'sceneHeading',
          attrs: { id: 'h2' },
          content: [{ type: 'text', text: 'EXT. ROOF - NIGHT' }],
        },
      ],
    },
  })
}

describe('scene number margin', () => {
  it('marks each numbered heading with its number and nothing else', () => {
    const ed = mount(
      new Map([
        ['h1', 4],
        ['h2', 5],
      ]),
    )
    const marked = [...ed.view.dom.querySelectorAll('[data-scene-number]')]
    expect(marked.map((n) => n.getAttribute('data-scene-number'))).toEqual(['4', '5'])
    expect(marked.every((n) => n.getAttribute('data-element') === 'sceneHeading')).toBe(true)
    ed.destroy()
  })

  it('a heading without a number (not yet indexed) is left unmarked', () => {
    const ed = mount(new Map([['h2', 1]]))
    expect(ed.view.dom.querySelectorAll('[data-scene-number]')).toHaveLength(1)
    ed.destroy()
  })

  it('picks up new numbers after a refresh transaction', () => {
    const numbers = new Map([['h1', 1]])
    const ed = mount(numbers)
    numbers.set('h1', 7)
    ed.view.dispatch(ed.state.tr.setMeta('sceneNumbers', true))
    expect(
      ed.view.dom.querySelector('[data-scene-number]')?.getAttribute('data-scene-number'),
    ).toBe('7')
    ed.destroy()
  })
})
