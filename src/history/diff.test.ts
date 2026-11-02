import { describe, expect, it } from 'vitest'
import { collapseSame, diffLines } from './diff'

describe('diffLines', () => {
  it('marks added and deleted lines and keeps the rest', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'same', text: 'c' },
    ])
  })

  it('is all same for equal text and all add / del against empty', () => {
    expect(diffLines('a\nb', 'a\nb').every((l) => l.type === 'same')).toBe(true)
    expect(diffLines('', 'a')).toEqual([{ type: 'add', text: 'a' }])
    expect(diffLines('a', '')).toEqual([{ type: 'del', text: 'a' }])
  })

  it('handles an insertion at the start', () => {
    expect(diffLines('b', 'a\nb').map((l) => l.type)).toEqual(['add', 'same'])
  })
})

describe('collapseSame', () => {
  it('keeps context around changes and folds long unchanged runs', () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
    const b = a.replace('l10', 'changed')
    const out = collapseSame(diffLines(a, b), 2)
    expect(out.filter((l) => l.type === 'skip')).toEqual([{ type: 'skip', count: 8 }, { type: 'skip', count: 7 }])
    expect(out.map((l) => ('text' in l ? l.text : '…'))).toEqual(['…', 'l8', 'l9', 'l10', 'changed', 'l11', 'l12', '…'])
  })

  it('does not fold a short run', () => {
    const out = collapseSame(diffLines('a\nb\nc', 'a\nx\nc'), 2)
    expect(out.some((l) => l.type === 'skip')).toBe(false)
  })
})
