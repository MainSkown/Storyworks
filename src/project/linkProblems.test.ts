import { describe, expect, it } from 'vitest'
import type { Link } from './links'
import { blockSnippet, buildProblems } from './linkProblems'

const p = (id: string, ...text: string[]) => ({
  type: 'paragraph',
  attrs: { id },
  content: text.map((t) => ({ type: 'text', text: t })),
})
const doc = { type: 'doc', content: [p('a', 'Hello ', 'world'), { type: 'bulletList', content: [{ type: 'listItem', content: [p('b', 'In a list')] }] }, p('c')] }

describe('blockSnippet', () => {
  it('joins the text of the block', () => expect(blockSnippet(doc, 'a')).toBe('Hello world'))
  it('finds nested blocks', () => expect(blockSnippet(doc, 'b')).toBe('In a list'))
  it('returns an empty string for an empty block', () => expect(blockSnippet(doc, 'c')).toBe(''))
  it('returns null when the block is gone', () => expect(blockSnippet(doc, 'zzz')).toBeNull())
  it('shortens long text with an ellipsis', () => {
    const long = { type: 'doc', content: [p('x', 'word '.repeat(50))] }
    const s = blockSnippet(long, 'x', 20)!
    expect(s.length).toBeLessThanOrEqual(20)
    expect(s.endsWith('…')).toBe(true)
  })
})

describe('buildProblems', () => {
  const link = (id: string): Link => ({
    id,
    kind: 'event',
    from: { item: 's', block: id },
    to: { item: 't', block: 'n' },
  })
  const links = [link('1'), link('2'), link('3'), link('4')]
  const check = {
    targetMissing: (l: Link) => l.id === '1' || l.id === '3',
    passageMissing: (l: Link) => l.id === '2' || l.id === '3',
  }

  it('lists only broken links, in order', () =>
    expect(buildProblems(links, check).map((x) => x.link.id)).toEqual(['1', '2', '3']))
  it('allows relinking only when the event is missing and the passage is fine', () => {
    const r = Object.fromEntries(buildProblems(links, check).map((x) => [x.link.id, x.canRelink]))
    expect(r).toEqual({ '1': true, '2': false, '3': false })
  })
  it('returns nothing for healthy links', () =>
    expect(buildProblems([link('4')], check)).toEqual([]))
})
