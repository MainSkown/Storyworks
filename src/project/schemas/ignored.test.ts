import { describe, expect, it } from 'vitest'
import {
  addIgnored,
  IGNORED_VERSION,
  ignoredIds,
  ignoredSchema,
  removeIgnored,
  type Ignored,
} from './ignored'

const empty: Ignored = { version: IGNORED_VERSION, ignored: [] }

describe('ignored schema', () => {
  it('accepts a valid file', () => {
    expect(ignoredSchema.safeParse({ version: 1, ignored: [{ id: 'mention:e:b' }] }).success).toBe(
      true,
    )
  })
  it('rejects unknown keys, a wrong version and bad entries', () => {
    expect(ignoredSchema.safeParse({ version: 1, ignored: [], extra: 1 }).success).toBe(false)
    expect(ignoredSchema.safeParse({ version: 2, ignored: [] }).success).toBe(false)
    expect(ignoredSchema.safeParse({ version: 1, ignored: [{ id: 'a', why: 'x' }] }).success).toBe(
      false,
    )
    expect(ignoredSchema.safeParse({ version: 1, ignored: [{ id: 3 }] }).success).toBe(false)
    expect(ignoredSchema.safeParse({ version: 1 }).success).toBe(false)
  })
})

describe('ignored helpers', () => {
  it('adds once, keeps order, returns the same object when nothing changes', () => {
    const a = addIgnored(empty, 'x')
    expect(a.ignored).toEqual([{ id: 'x' }])
    expect(addIgnored(a, 'x')).toBe(a)
    expect(addIgnored(a, 'y').ignored.map((i) => i.id)).toEqual(['x', 'y'])
  })
  it('removes, and leaves an unknown id alone', () => {
    const a = addIgnored(addIgnored(empty, 'x'), 'y')
    expect(removeIgnored(a, 'x').ignored).toEqual([{ id: 'y' }])
    expect(removeIgnored(a, 'nope')).toBe(a)
  })
  it('lists ids as a set', () => {
    expect(ignoredIds(addIgnored(empty, 'x'))).toEqual(new Set(['x']))
    expect(ignoredIds(null)).toEqual(new Set())
  })
})
