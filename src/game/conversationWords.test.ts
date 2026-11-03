import { describe, expect, it } from 'vitest'
import { conversationWords } from './conversationWords'
import { conversationSchema } from '../project/schemas/conversation'

const line = (n: number, text: string, speakerName: string | null = null) => ({
  type: 'line',
  attrs: { id: `b${n}`, lineId: `L00000${n}`, speakerId: null, speakerName },
  content: text ? [{ type: 'text', text }] : [],
})
const lines = (id: string, ...ls: unknown[]) => ({
  id,
  x: 0,
  y: 0,
  type: 'lines',
  next: null,
  content: { type: 'doc', content: ls },
})
const conv = (nodes: unknown[]) =>
  conversationSchema.parse({ version: 3, id: 'c', title: 'T', startNodeId: null, nodes })

describe('conversationWords', () => {
  it('counts line text across all lines nodes, not speakers or options', () => {
    const c = conv([
      lines('a', line(1, 'one two three', 'Old Man Willow'), line(2, '')),
      { id: 'b', x: 0, y: 0, type: 'choice', options: [{ id: 'o', text: 'not counted', target: null }] },
      lines('c', line(3, 'four five')),
    ])
    expect(conversationWords(c)).toBe(5)
  })

  it('is zero for an empty conversation', () => {
    expect(conversationWords(conv([]))).toBe(0)
  })
})
