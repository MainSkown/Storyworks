import { describe, expect, it } from 'vitest'
import { ELEMENTS, type ElementType, cycle, emptyFallback, nextElement } from './rules'

describe('Enter on a block with text', () => {
  it.each([
    ['sceneHeading', 'action'],
    ['action', 'action'],
    ['character', 'dialogue'],
    ['dialogue', 'action'],
    ['parenthetical', 'dialogue'],
    ['transition', 'sceneHeading'],
  ] as const)('%s -> %s', (from, to) => {
    expect(nextElement(from)).toBe(to)
  })
})

describe('Enter on an empty block', () => {
  it.each([
    ['dialogue', 'character'],
    ['parenthetical', 'character'],
    ['action', 'sceneHeading'],
    ['sceneHeading', 'action'],
    ['character', 'action'],
    ['transition', 'action'],
  ] as const)('%s becomes %s', (from, to) => {
    expect(emptyFallback(from)).toBe(to)
  })

  it('never stays the same type', () => {
    for (const t of ELEMENTS) expect(emptyFallback(t)).not.toBe(t)
  })
})

describe('Tab / Shift+Tab cycle', () => {
  it('goes heading > action > character > dialogue > parenthetical > transition > heading', () => {
    expect(ELEMENTS).toEqual([
      'sceneHeading',
      'action',
      'character',
      'dialogue',
      'parenthetical',
      'transition',
    ])
    let t: ElementType = ELEMENTS[0]
    const seen: string[] = []
    for (let i = 0; i < ELEMENTS.length; i++) {
      t = cycle(t, 1)
      seen.push(t)
    }
    expect(seen).toEqual([...ELEMENTS.slice(1), 'sceneHeading'])
  })

  it('backwards is the exact reverse, wrapping at the start', () => {
    expect(cycle('sceneHeading', -1)).toBe('transition')
    for (const t of ELEMENTS) expect(cycle(cycle(t, 1), -1)).toBe(t)
  })
})
