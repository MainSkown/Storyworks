import { describe, expect, it } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { createSpellEngine } from '../spell/engine'
import { misspellingRanges, textUnits } from './spellRanges'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    footnote: { group: 'inline', inline: true, atom: true, content: 'text*', marks: '' },
    hardBreak: { group: 'inline', inline: true },
  },
  marks: { bold: {}, italic: {} },
})
const bold = schema.marks.bold!.create()
const t = (s: string, marks = false) => schema.text(s, marks ? [bold] : [])
const p = (...c: ReturnType<typeof t>[]) => schema.nodes.paragraph!.create(null, c)
const doc = (...b: ReturnType<typeof p>[]) => schema.nodes.doc!.create(null, b)

const engine = createSpellEngine({
  load: async () => ({ kind: 'wordlist', words: ['hello', 'world', 'cześć', 'świat'] }),
})
await engine.setDictionaries([{ name: 'x', scope: 'global' }], [])

const flagged = (d: ReturnType<typeof doc>) =>
  textUnits(d).flatMap((u) =>
    misspellingRanges(u, engine.checkText(u.text)).map((r) => d.textBetween(r.from, r.to)),
  )

describe('spell ranges', () => {
  it('maps offsets to document positions', () => {
    const d = doc(p(t('hello wrld')), p(t('one two')))
    const [u1] = textUnits(d)
    const [r] = misspellingRanges(u1!, engine.checkText(u1!.text))
    expect(d.textBetween(r!.from, r!.to)).toBe('wrld')
    expect(r!.from).toBe(1 + 6)
  })

  it('keeps a word whole across mark boundaries', () => {
    expect(flagged(doc(p(t('hel'), t('lo wor', true), t('ldd'))))).toEqual(['worldd'])
  })

  it('does not join words across inline nodes', () => {
    const fn = schema.nodes.footnote!.create(null, [t('nootte')])
    const d = doc(p(t('hello'), fn, t('world'), schema.nodes.hardBreak!.create(), t('wrld')))
    expect(flagged(d)).toEqual(['wrld'])
  })

  it('maps Polish text with diacritics', () => {
    expect(flagged(doc(p(t('cześć światt'))))).toEqual(['światt'])
  })

  it('leaves footnote bodies alone', () => {
    const fn = schema.nodes.footnote!.create(null, [t('hello wrld')])
    const d = doc(p(t('hello '), fn))
    expect(textUnits(d)).toHaveLength(1)
    expect(flagged(d)).toEqual([])
  })
})
