import { describe, expect, it } from 'vitest'
import { formOfContent } from './form'

const doc = (...c: unknown[]) => ({ type: 'doc', content: c })

describe('formOfContent', () => {
  it('lines make a script', () => {
    expect(formOfContent(doc({ type: 'line' }))).toBe('script')
  })
  it('prose blocks make a text item', () => {
    expect(formOfContent(doc({ type: 'paragraph' }))).toBe('text')
    expect(formOfContent(doc({ type: 'blockquote' }, { type: 'paragraph' }))).toBe('text')
  })
  it('an empty or odd doc is a script', () => {
    expect(formOfContent(doc())).toBe('script')
    expect(formOfContent({ type: 'doc' })).toBe('script')
    expect(formOfContent({})).toBe('script')
  })
})
