import { describe, expect, it } from 'vitest'
import { itemText } from './itemText'

const bytes = (s: string) => new TextEncoder().encode(s)

describe('itemText', () => {
  it('turns a scene into title and one line per block', () => {
    const scene = { title: 'Dawn', content: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Two' }] },
    ] } }
    expect(itemText('scene', bytes(JSON.stringify(scene)))).toBe('Dawn\n\nOne\nTwo')
  })

  it('pretty-prints other JSON and passes text through', () => {
    expect(itemText('rule', bytes('{"a":1}'))).toBe('{\n  "a": 1\n}')
    expect(itemText('file', bytes('not json'))).toBe('not json')
  })

  it('shows a scene that is not valid JSON as raw text', () => {
    expect(itemText('scene', bytes('{oops'))).toBe('{oops')
  })
})
