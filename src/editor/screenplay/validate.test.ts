import { describe, expect, it } from 'vitest'
import { screenplayContentProblem } from './validate'

const el = (type: string) => ({ type, attrs: { id: 'a' }, content: [{ type: 'text', text: 'x' }] })

describe('screenplay scene content', () => {
  it('accepts an empty doc and element blocks only', () => {
    expect(screenplayContentProblem({ type: 'doc', content: [] })).toBeNull()
    expect(
      screenplayContentProblem({
        type: 'doc',
        content: [
          'sceneHeading',
          'action',
          'character',
          'dialogue',
          'parenthetical',
          'transition',
        ].map(el),
      }),
    ).toBeNull()
  })

  it('names the first block that is not a script element', () => {
    const doc = { type: 'doc', content: [el('action'), el('heading'), el('paragraph')] }
    expect(screenplayContentProblem(doc)).toBe('heading')
  })

  it('rejects a doc that is not a doc', () => {
    expect(screenplayContentProblem({ type: 'paragraph' })).toBe('paragraph')
  })
})
