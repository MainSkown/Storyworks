import { describe, expect, it } from 'vitest'
import { freeSampleName, newSampleRoot } from './location'

describe('sample location', () => {
  it('uses the first free name', async () => {
    const taken = new Set(['sample-book', 'sample-book-2'])
    expect(await freeSampleName(async (n) => taken.has(n))).toBe('sample-book-3')
  })
  it('starts with sample-book when nothing is taken', async () => {
    expect(await freeSampleName(async () => false)).toBe('sample-book')
  })
  it('in the browser skips existing virtual folders', async () => {
    expect(await newSampleRoot(false, () => ['sample-book'], async () => false)).toBe('sample-book-2')
  })
})
