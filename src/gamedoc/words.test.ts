import { describe, expect, it } from 'vitest'
import { gameDocWords } from './words'

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

describe('gameDocWords', () => {
  it('counts overview, mechanic summary and description, parameters and glossary', () => {
    expect(
      gameDocWords({
        overview: doc('one two three'),
        mechanics: [{ summary: 'a b', description: doc('c d e'), parameters: [{ name: 'Max HP', value: '100' }] }],
        glossary: [{ term: 'Gold', definition: 'Common currency' }],
      }),
    ).toBe(3 + 2 + 3 + 3 + 3)
  })
  it('empty parts count zero', () => {
    expect(gameDocWords({ overview: null, mechanics: [], glossary: [] })).toBe(0)
  })
})
