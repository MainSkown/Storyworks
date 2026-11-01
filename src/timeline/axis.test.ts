import { describe, expect, it } from 'vitest'
import { thinTicks } from './axis'

describe('thinTicks', () => {
  it('keeps ticks that are far enough apart, in x order', () => {
    const out = thinTicks(
      [
        { x: 300, label: 'c' },
        { x: 0, label: 'a' },
        { x: 50, label: 'b' },
      ],
      100,
    )
    expect(out.map((t) => t.label)).toEqual(['a', 'c'])
  })

  it('merges ticks at the same x', () => {
    expect(
      thinTicks(
        [
          { x: 10, label: 'a' },
          { x: 10, label: 'a' },
        ],
        50,
      ),
    ).toHaveLength(1)
  })

  it('always keeps the last tick', () => {
    const out = thinTicks(
      [
        { x: 0, label: 'a' },
        { x: 80, label: 'b' },
        { x: 100, label: 'c' },
      ],
      70,
    )
    expect(out.map((t) => t.label)).toEqual(['a', 'c'])
  })
})
