import { describe, expect, it } from 'vitest'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { Scene } from '../project/schemas/scene'
import { ExportError } from './build'
import { flatElements } from './scriptModel'
import { defaultScriptExportOptions } from './scriptOptions'
import { prepareScript, type ScriptSource } from './scriptDoc'

const scene = (id: string, title: string): ManuscriptNode => ({ id, type: 'scene', title, path: `s/${id}.json`, children: [] })
const seq = (id: string, title: string, ...children: ManuscriptNode[]): ManuscriptNode => ({ id, type: 'chapter', title, children })
const b = (type: string, text: string, id: string, marks?: unknown[]) => ({
  type,
  attrs: { id },
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
})
const docs: Record<string, unknown[]> = {
  s1: [b('sceneHeading', 'int. a - day', 'h1'), b('action', 'She waits.', 'a1')],
  s2: [b('sceneHeading', 'ext. b - night', 'h2'), b('character', 'anna', 'c1'), b('dialogue', 'Hello', 'd1', [{ type: 'comment', attrs: { id: 'x' } }])],
  s3: [b('sceneHeading', 'int. c - day', 'h3')],
}
function source(over: Partial<ScriptSource> = {}): ScriptSource {
  return {
    meta: { title: 'T', author: 'A', language: 'en' },
    titlePage: { contact: 'a@b.c', date: '2026' },
    manuscript: [seq('q1', 'Opening', scene('s1', 'One'), scene('s2', 'Two')), seq('q2', 'Middle', scene('s3', 'Three'))],
    loadScene: async (path) => {
      const id = path.split('/')[1]!.replace('.json', '')
      return { ok: true, value: { id, content: { type: 'doc', content: docs[id] } } as unknown as Scene }
    },
    numbers: new Map([['h1', 1], ['h2', 2], ['h3', 3]]),
    ...over,
  }
}
const opts = defaultScriptExportOptions()

describe('prepareScript', () => {
  it('builds sequences and scenes in tree order with elements and numbers', async () => {
    const doc = await prepareScript(source(), ['q1', 'q2'], opts)
    expect(doc.sequences.map((s) => [s.title, s.scenes.map((x) => x.title)])).toEqual([
      ['Opening', ['One', 'Two']],
      ['Middle', ['Three']],
    ])
    const heads = flatElements(doc).filter((e) => e.type === 'sceneHeading')
    expect(heads.map((h) => h.number)).toEqual([1, 2, 3])
  })

  it('exports only the selected sequences but keeps the script-wide numbers', async () => {
    const doc = await prepareScript(source(), ['q2'], opts)
    expect(doc.sequences.map((s) => s.id)).toEqual(['q2'])
    expect(flatElements(doc)[0]!.number).toBe(3)
  })

  it('drops scene numbers when the option is off', async () => {
    const doc = await prepareScript(source(), ['q1'], { ...opts, sceneNumbers: false })
    expect(flatElements(doc).every((e) => e.number === undefined)).toBe(true)
  })

  it('carries plain text only: no comment marks, block ids or links', async () => {
    const doc = await prepareScript(source(), ['q1'], opts)
    expect(JSON.stringify(doc)).not.toContain('comment')
    expect(flatElements(doc).map((e) => e.key)).toEqual(Array(flatElements(doc).length).fill(undefined))
  })

  it('refuses when nothing is selected', async () => {
    await expect(prepareScript(source(), [], opts)).rejects.toMatchObject({ code: 'nothingSelected' })
  })

  it('fails with the scene title when a scene cannot be read', async () => {
    const bad = source({ loadScene: async () => ({ ok: false, message: 'broken' }) })
    await expect(prepareScript(bad, ['q1'], opts)).rejects.toBeInstanceOf(ExportError)
    await expect(prepareScript(bad, ['q1'], opts)).rejects.toMatchObject({ code: 'sceneUnreadable', detail: 'One' })
  })

  it('always includes scenes that sit directly in the root', async () => {
    const doc = await prepareScript(source({ manuscript: [scene('s3', 'Loose')] }), [], opts)
    expect(doc.sequences).toHaveLength(1)
    expect(doc.sequences[0]!.title).toBe('')
    expect(flatElements(doc)).toHaveLength(1)
  })

  it('warns about blocks that are not script elements', async () => {
    docs.s1 = [...docs.s1!, { type: 'paragraph', content: [{ type: 'text', text: 'x' }] }]
    const doc = await prepareScript(source(), ['q1'], opts)
    expect(doc.warnings).toEqual([{ kind: 'unknownNode', detail: 'paragraph' }])
    docs.s1 = docs.s1.slice(0, 2)
  })
})
