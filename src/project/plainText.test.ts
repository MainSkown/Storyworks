import { describe, expect, it } from 'vitest'
import { docToText, textToDoc } from './plainText'
import { sceneSchema, SCENE_VERSION } from './schemas/scene'

const para = (id: string, text?: string) => ({
  type: 'paragraph',
  attrs: { id },
  ...(text ? { content: [{ type: 'text', text }] } : {}),
})
const doc = (...content: unknown[]) => ({ type: 'doc', content })
const counter = () => {
  let n = 0
  return () => `new${++n}`
}
const idsOf = (d: Record<string, unknown>) =>
  (d.content as { attrs: { id: string } }[]).map((p) => p.attrs.id)

describe('docToText', () => {
  it('joins paragraphs with newlines, empty paragraph is an empty line', () => {
    expect(docToText(doc(para('a', 'One'), para('b'), para('c', 'Two')))).toBe('One\n\nTwo')
  })

  it('reads nested text and empty docs', () => {
    expect(docToText({ type: 'doc', content: [] })).toBe('')
    expect(docToText({ type: 'doc' })).toBe('')
    const rich = doc({
      type: 'paragraph',
      attrs: { id: 'a' },
      content: [
        { type: 'text', text: 'Hi ' },
        { type: 'text', text: 'there', marks: [{ type: 'bold' }] },
      ],
    })
    expect(docToText(rich)).toBe('Hi there')
  })
})

describe('textToDoc', () => {
  it('makes one paragraph per line; empty line has no content', () => {
    const d = textToDoc('A\n\nB', doc(), counter())
    expect(d).toEqual(doc(para('new1', 'A'), para('new2'), para('new3', 'B')))
  })

  it('empty text gives an empty doc', () => {
    expect(textToDoc('', doc(para('a', 'x')), counter())).toEqual(doc())
  })

  it('keeps ids of unchanged lines', () => {
    const prev = doc(para('a', 'One'), para('b', 'Two'))
    expect(idsOf(textToDoc('One\nTwo', prev, counter()))).toEqual(['a', 'b'])
  })

  it('reuses ids positionally for edited lines', () => {
    const prev = doc(para('a', 'One'), para('b', 'Two'), para('c', 'Three'))
    expect(idsOf(textToDoc('One\nTwo!\nThree', prev, counter()))).toEqual(['a', 'b', 'c'])
  })

  it('creates ids only for added lines', () => {
    const prev = doc(para('a', 'One'), para('b', 'Two'))
    expect(idsOf(textToDoc('One\nMiddle\nTwo', prev, counter()))).toEqual(['a', 'new1', 'b'])
    expect(idsOf(textToDoc('One\nTwo\nEnd', prev, counter()))).toEqual(['a', 'b', 'new1'])
    expect(idsOf(textToDoc('Start\nOne\nTwo', prev, counter()))).toEqual(['new1', 'a', 'b'])
  })

  it('drops ids of removed lines', () => {
    const prev = doc(para('a', 'One'), para('b', 'Two'), para('c', 'Three'))
    expect(idsOf(textToDoc('One\nThree', prev, counter()))).toEqual(['a', 'c'])
  })

  it('keeps ids unique even when the previous doc repeats one', () => {
    const prev = doc(para('a', 'One'), para('a', 'Two'))
    const ids = idsOf(textToDoc('One\nTwo', prev, counter()))
    expect(new Set(ids).size).toBe(2)
  })

  it('result passes the scene schema', () => {
    const content = textToDoc('x\ny\nz', doc(para('a', 'x')))
    const scene = { version: SCENE_VERSION, id: 's', title: 't', content }
    expect(sceneSchema.safeParse(scene).success).toBe(true)
  })
})
