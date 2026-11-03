import { describe, expect, it } from 'vitest'
import { elementsOfDoc } from './elements'

const block = (type: string, content: unknown[], id = 'b1') => ({ type, attrs: { id }, content })
const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) })

describe('elementsOfDoc', () => {
  it('reads typed blocks with their text and ids, ignoring marks', () => {
    const doc = {
      type: 'doc',
      content: [
        block('sceneHeading', [text('INT. A - DAY')], 'h1'),
        block('dialogue', [text('Hi '), text('there', [{ type: 'comment', attrs: { id: 'c' } }])], 'd1'),
      ],
    }
    expect(elementsOfDoc(doc)).toEqual([
      { type: 'sceneHeading', text: 'INT. A - DAY', key: 'h1' },
      { type: 'dialogue', text: 'Hi there', key: 'd1' },
    ])
  })

  it('turns hard breaks into line breaks', () => {
    const doc = { type: 'doc', content: [block('action', [text('a'), { type: 'hardBreak' }, text('b')])] }
    expect(elementsOfDoc(doc)[0]!.text).toBe('a\nb')
  })

  it('gives an empty block empty text and skips non-element blocks', () => {
    const doc = { type: 'doc', content: [{ type: 'action' }, block('paragraph', [text('x')])] }
    expect(elementsOfDoc(doc)).toEqual([{ type: 'action', text: '' }])
  })

  it('returns nothing for a malformed doc', () => {
    expect(elementsOfDoc(null)).toEqual([])
    expect(elementsOfDoc({ type: 'doc' })).toEqual([])
  })
})
