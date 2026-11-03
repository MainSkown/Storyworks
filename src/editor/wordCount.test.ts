import { describe, expect, it } from 'vitest'
import type { ManuscriptNode } from '../project/schemas/manifest'
import { countWords, rollUp } from './wordCount'

const text = (t: string, marks: unknown[] = []) => ({ type: 'text', text: t, marks })
const p = (...inline: unknown[]) => ({ type: 'paragraph', content: inline })
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks })

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords(doc(p(text('one two  three\tfour\nfive'))))).toBe(5)
  })

  it('is 0 for an empty doc and for nonsense input', () => {
    expect(countWords(doc())).toBe(0)
    expect(countWords(doc(p()))).toBe(0)
    expect(countWords(null)).toBe(0)
    expect(countWords(undefined)).toBe(0)
  })

  it('does not split a word across formatting marks', () => {
    expect(countWords(doc(p(text('foo'), text('bar', [{ type: 'bold' }]))))).toBe(1)
  })

  it('counts words in separate blocks separately', () => {
    expect(countWords(doc(p(text('a b')), p(text('c'))))).toBe(3)
  })

  it('counts words in nested blocks such as list items', () => {
    const list = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [p(text('one two'))] }],
    }
    expect(countWords(doc(list, p(text('three'))))).toBe(3)
  })

  it('ignores footnote contents', () => {
    const note = { type: 'footnote', content: [text('seven words inside the footnote body here')] }
    expect(countWords(doc(p(text('before'), note, text(' after'))))).toBe(2)
  })

  it('counts images and scene breaks as 0', () => {
    const image = { type: 'image', attrs: { src: 'assets/a.png', alt: 'a nice picture' } }
    expect(countWords(doc(image, { type: 'sceneBreak' }, p(text('x'))))).toBe(1)
  })
})

const n = (id: string, type: ManuscriptNode['type'], children: ManuscriptNode[] = []) =>
  ({ id, type, title: id, children }) as ManuscriptNode

describe('rollUp', () => {
  const tree = [
    n('p', 'part', [
      n('ch1', 'chapter', [n('a', 'scene'), n('b', 'scene')]),
      n('ch2', 'chapter', [n('x', 'scene')]),
    ]),
    n('ch3', 'chapter', [n('y', 'scene')]),
    n('r', 'scene'),
  ]
  const counts = new Map([
    ['a', 10],
    ['b', 20],
    ['x', 5],
    ['y', 100],
    ['r', 1],
  ])

  it('sums descendant scenes for chapters and parts', () => {
    const out = rollUp(tree, counts)
    expect(out.get('ch1')).toBe(30)
    expect(out.get('ch2')).toBe(5)
    expect(out.get('p')).toBe(35)
    expect(out.get('ch3')).toBe(100)
  })

  it('gives a scene its own count', () => {
    expect(rollUp(tree, counts).get('b')).toBe(20)
  })

  it('counts a conversation like a scene', () => {
    const t = [n('f', 'chapter', [n('c', 'conversation'), n('s', 'scene')])]
    const out = rollUp(t, new Map([['c', 7], ['s', 3]]))
    expect(out.get('c')).toBe(7)
    expect(out.get('f')).toBe(10)
  })

  it("puts the book total under ''", () => {
    expect(rollUp(tree, counts).get('')).toBe(136)
  })

  it('treats a scene without a count as 0', () => {
    const out = rollUp(tree, new Map([['a', 4]]))
    expect(out.get('ch1')).toBe(4)
    expect(out.get('')).toBe(4)
  })

  it('gives an empty chapter 0 and an empty book 0', () => {
    expect(rollUp([n('e', 'chapter')], counts).get('e')).toBe(0)
    expect(rollUp([], counts).get('')).toBe(0)
  })
})
