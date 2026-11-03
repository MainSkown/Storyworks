import { describe, expect, it } from 'vitest'
import type { ElementType } from '../editor/screenplay/rules'
import type { ScriptElement } from '../editor/screenplay/layout'
import { toFountain } from '../export/fountain'
import type { ScriptDoc } from '../export/scriptModel'
import { defaultScriptExportOptions } from '../export/scriptOptions'
import { parseFountain } from './fountain'

const el = (type: ElementType, text: string): ScriptElement => ({ type, text })
const UP: ElementType[] = ['sceneHeading', 'character', 'transition']

const scenes = {
  s1: [
    el('sceneHeading', 'int. zajazd - noc'),
    el('action', 'Łukasz wchodzi. Żar bije z pieca.'),
    el('character', 'zażółć'),
    el('parenthetical', 'szeptem'),
    el('dialogue', 'Gęślą jaźń.\n\nDruga część.'),
    el('transition', 'cut to:'),
  ],
  s2: [
    el('sceneHeading', 'Dom babci'),
    el('action', '!krzyk'),
    el('action', '.kropka'),
    el('action', '@ktoś'),
    el('action', '#hasz'),
    el('action', 'CISZA'),
    el('action', 'HUK\nPotem cisza.'),
    el('transition', 'Przejście'),
  ],
  s3: [el('sceneHeading', 'ext. las - dzień'), el('character', 'ANNA'), el('dialogue', 'Idę.')],
}
const doc: ScriptDoc = {
  meta: { title: 'T', author: 'A', language: 'pl' },
  titlePage: { contact: '', date: '' },
  options: { ...defaultScriptExportOptions(), titlePage: false },
  sequences: [
    { id: 'q1', title: '', scenes: [{ id: 's1', title: 'a', elements: scenes.s1 }, { id: 's2', title: 'b', elements: scenes.s2 }] },
    { id: 'q2', title: 'Akt drugi', scenes: [{ id: 's3', title: 'c', elements: scenes.s3 }] },
  ],
  warnings: [],
}

describe('Fountain round trip', () => {
  const r = parseFountain(toFountain(doc))
  const expected = (els: ScriptElement[]) =>
    els.map((e) => ({
      type: e.type,
      text: UP.includes(e.type) ? e.text.toUpperCase() : e.type === 'parenthetical' ? `(${e.text})` : e.text,
    }))

  it('keeps sequence titles and scene counts', () => {
    expect(r.sequences.map((s) => [s.title, s.scenes.length])).toEqual([['', 2], ['Akt drugi', 1]])
  })
  it('keeps element types and text', () => {
    const got = r.sequences.flatMap((s) => s.scenes.map((sc) => sc.elements))
    expect(got).toEqual([expected(scenes.s1), expected(scenes.s2), expected(scenes.s3)])
  })
  it('reports nothing as skipped', () => {
    expect(r.skipped).toEqual([])
    expect(r.noSceneHeadings).toBe(false)
  })
  it('reads the title page back', () => {
    const t = toFountain({ ...doc, options: { ...doc.options, titlePage: true }, titlePage: { contact: 'a@b.c', date: '2026' } })
    expect(parseFountain(t).titlePage).toEqual({ title: 'T', author: 'A', contact: 'a@b.c', 'draft date': '2026' })
  })
})
