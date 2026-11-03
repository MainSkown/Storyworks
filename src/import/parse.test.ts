import { describe, expect, it } from 'vitest'
import { parseMarkdown, parsePlainText, type PMNode } from './parse'

const types = (b: PMNode[]) => b.map((n) => n.type)
const text = (n: PMNode): string =>
  n.text ?? (n.content ?? []).map((c) => (c.type === 'hardBreak' ? '\n' : text(c))).join('')

describe('parseMarkdown', () => {
  it('maps headings and clamps deeper levels to 3', () => {
    const b = parseMarkdown('# A\n\n## B\n\n### C\n\n#### D\n\n###### E')
    expect(b.map((n) => n.attrs?.level)).toEqual([1, 2, 3, 3, 3])
  })

  it('maps bold and italic to marks', () => {
    const [p] = parseMarkdown('plain **b** and *i*')
    const marks = (p!.content ?? []).map((n) => [n.text, n.marks?.[0]?.type])
    expect(marks).toEqual([['plain ', undefined], ['b', 'bold'], [' and ', undefined], ['i', 'italic']])
  })

  it('maps lists, nested lists and quotes', () => {
    const b = parseMarkdown('- one\n  - inner\n- two\n\n1. x\n2. y\n\n> quoted')
    expect(types(b)).toEqual(['bulletList', 'orderedList', 'blockquote'])
    const items = b[0]!.content!
    expect(items.map((i) => i.type)).toEqual(['listItem', 'listItem'])
    expect(items[0]!.content!.map((c) => c.type)).toEqual(['paragraph', 'bulletList'])
    expect(text(b[2]!)).toBe('quoted')
  })

  it('maps scene break lines to sceneBreak', () => {
    const b = parseMarkdown('a\n\n***\n\nb\n\n* * *\n\nc\n\n---\n\nd')
    expect(types(b)).toEqual(['paragraph', 'sceneBreak', 'paragraph', 'sceneBreak', 'paragraph', 'sceneBreak', 'paragraph'])
  })

  it('maps footnotes to inline footnote nodes and drops the definitions', () => {
    const b = parseMarkdown('Word[^1] here.\n\n[^1]: The *note* body.')
    expect(b).toHaveLength(1)
    const fn = b[0]!.content!.find((n) => n.type === 'footnote')!
    expect(fn.content).toEqual([{ type: 'text', text: 'The note body.' }])
  })

  it('lifts an inline image to its own block', () => {
    const b = parseMarkdown('Before ![cat](pics/cat.png "Tom") after')
    expect(types(b)).toEqual(['paragraph', 'image', 'paragraph'])
    expect(b[1]!.attrs).toMatchObject({ src: 'pics/cat.png', alt: 'cat', title: 'Tom' })
  })

  it('keeps link text, ignores the link', () => {
    const [p] = parseMarkdown('see [here](http://x.y)')
    expect(text(p!)).toBe('see here')
  })

  it('turns a soft line break into a space', () => {
    expect(text(parseMarkdown('one\ntwo')[0]!)).toBe('one two')
  })
})

describe('parsePlainText', () => {
  it('makes paragraphs at blank lines and hard breaks inside', () => {
    const b = parsePlainText('line1\nline2\n\n\npara2')
    expect(types(b)).toEqual(['paragraph', 'paragraph'])
    expect(text(b[0]!)).toBe('line1\nline2')
  })

  it('recognises blank-line-separated break lines only', () => {
    const b = parsePlainText('a\n\n***\n\nb\n\n* * *\n\nc\nd\n---\ne')
    expect(types(b)).toEqual(['paragraph', 'sceneBreak', 'paragraph', 'sceneBreak', 'paragraph'])
    expect(text(b[4]!)).toBe('c\nd\n---\ne')
  })
})
