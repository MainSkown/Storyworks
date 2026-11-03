import { describe, expect, it } from 'vitest'
import { speakerIdsOf } from './lines'
import { countWords } from '../wordCount'

const line = (
  text: string,
  speakerId: string | null = null,
  speakerName: string | null = null,
) => ({
  type: 'line',
  attrs: { id: 'x', lineId: 'L000001', speakerId, speakerName },
  content: text ? [{ type: 'text', text }] : [],
})
const doc = (...c: unknown[]) => ({ type: 'doc', content: c })

describe('script lines', () => {
  it('lists the codex speaker of every line, repeats included', () => {
    expect(
      speakerIdsOf(doc(line('a', 'e1'), line('b'), line('c', null, 'Bob'), line('d', 'e1'))),
    ).toEqual(['e1', 'e1'])
  })

  it('has none for other docs', () => {
    expect(speakerIdsOf(doc({ type: 'paragraph' }))).toEqual([])
    expect(speakerIdsOf({ type: 'doc' })).toEqual([])
  })

  it('counts only the words of the line text, not the speaker', () => {
    expect(countWords(doc(line('one two three', null, 'Old Man Willow'), line('four', 'e1')))).toBe(
      4,
    )
  })
})

describe('script lines in search', () => {
  it('each line is a search part with its block id', async () => {
    const { sceneParts } = await import('../../search/build')
    const l = (id: string, text: string) => ({
      type: 'line',
      attrs: { id, lineId: 'L000001', speakerId: null, speakerName: null },
      content: [{ type: 'text', text }],
    })
    expect(sceneParts(doc(l('b1', 'Hello there'), l('b2', 'Go away')))).toEqual([
      { text: 'Hello there', blockId: 'b1' },
      { text: 'Go away', blockId: 'b2' },
    ])
  })
})
