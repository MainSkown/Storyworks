import { describe, expect, it } from 'vitest'
import { parseMarkdown, parsePlainText } from './parse'
import { splitBlocks } from './split'

const MD = [
  'Preface text.',
  '# One',
  'a1',
  '## One-A',
  'a2',
  '## One-B',
  'b1',
  '***',
  'b2',
  '# Two',
  't1',
]
  .join('\n\n')

const shape = (c: ReturnType<typeof splitBlocks>) =>
  c.map((ch) => [ch.title, ch.scenes.map((s) => [s.title, s.blocks.length])])

describe('splitBlocks', () => {
  it('H1/H2: H1 = chapter, H2 = scene, preamble gets its own untitled chapter', () => {
    expect(shape(splitBlocks(parseMarkdown(MD), 'h1h2'))).toEqual([
      [null, [[null, 1]]],
      ['One', [[null, 1], ['One-A', 1], ['One-B', 3]]],
      ['Two', [[null, 1]]],
    ])
  })

  it('H1 only: one scene per chapter, H2 stays as a heading in it', () => {
    const r = splitBlocks(parseMarkdown(MD), 'h1')
    expect(shape(r)).toEqual([
      [null, [[null, 1]]],
      ['One', [[null, 7]]],
      ['Two', [[null, 1]]],
    ])
    expect(r[1]!.scenes[0]!.blocks.some((b) => b.type === 'heading')).toBe(true)
  })

  it('scene-break rule: one chapter, break lines split scenes and are dropped', () => {
    const r = splitBlocks(parseMarkdown('# Title\n\na\n\n***\n\nb\n\n---\n\n---\n\nc'), 'break')
    expect(shape(r)).toEqual([['Title', [[null, 1], [null, 1], [null, 1]]]])
  })

  it('plain text splits at break lines', () => {
    const r = splitBlocks(parsePlainText('a\n\n***\n\nb'), 'break')
    expect(shape(r)).toEqual([[null, [[null, 1], [null, 1]]]])
  })

  it('a chapter heading without content still gets one empty scene', () => {
    expect(shape(splitBlocks(parseMarkdown('# A\n\n# B\n\ntext'), 'h1h2'))).toEqual([
      ['A', [[null, 0]]],
      ['B', [[null, 1]]],
    ])
  })
})
