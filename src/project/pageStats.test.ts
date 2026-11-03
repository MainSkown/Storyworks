import { describe, expect, it } from 'vitest'
import type { ScriptElement } from '../editor/screenplay/layout'
import { prepareScript } from '../export/scriptDoc'
import { flatElements } from '../export/scriptModel'
import { defaultScriptExportOptions } from '../export/scriptOptions'
import { scriptPages } from '../export/pdfScript'
import type { ManuscriptNode } from './schemas/manifest'
import type { Scene } from './schemas/scene'
import { scriptPageStats } from './pageStats'

const scene = (id: string): ManuscriptNode => ({ id, type: 'scene', title: id, path: `s/${id}.json`, children: [] })
const seq = (id: string, ...children: ManuscriptNode[]): ManuscriptNode => ({ id, type: 'chapter', title: id, children })
const opts = { pageSize: 'Letter' as const, language: 'en', moreContd: true }
const el = (type: ScriptElement['type'], text: string): ScriptElement => ({ type, text })
const lines = (n: number) => el('action', Array.from({ length: n }, () => 'a'.repeat(60)).join(' '))

describe('scriptPageStats', () => {
  it('is zero for an empty script', () => {
    expect(scriptPageStats([seq('q', scene('a'))], () => [], opts)).toEqual({ pages: 0, minutes: 0 })
  })

  it('counts pages across scenes in tree order and grows when dialogue is added', () => {
    const tree = [seq('q', scene('a'), scene('b'))]
    const small = new Map([['a', [lines(30)]], ['b', [lines(10)]]])
    expect(scriptPageStats(tree, (id) => small.get(id), opts).pages).toBe(1)
    const more = new Map(small)
    more.set('b', [lines(10), el('character', 'anna'), el('dialogue', 'Hello there. '.repeat(40))])
    expect(scriptPageStats(tree, (id) => more.get(id), opts).pages).toBe(2)
  })

  it('ignores scenes that are not in the tree (trashed) and unknown ids', () => {
    const all = new Map([['a', [lines(60)]], ['gone', [lines(200)]]])
    expect(scriptPageStats([seq('q', scene('a'), scene('b'))], (id) => all.get(id), opts).pages).toBe(2)
  })

  it('estimates about one minute per page, counting a part page by its fill', () => {
    const tree = [seq('q', scene('a'))]
    expect(scriptPageStats(tree, () => [lines(55 + 28)], opts).minutes).toBe(2) // 1.5 pages -> 2
    expect(scriptPageStats(tree, () => [lines(5)], opts).minutes).toBe(0) // under a quarter page
  })

  it('equals the page count of the exported PDF layout', async () => {
    const elementsByScene = new Map<string, ScriptElement[]>()
    const tree: ManuscriptNode[] = []
    for (let s = 0; s < 12; s++) {
      const id = `s${s}`
      tree.push(scene(id))
      elementsByScene.set(id, [
        el('sceneHeading', `int. place ${s} - day`),
        lines(7),
        el('character', 'anna'),
        el('dialogue', 'A long speech. '.repeat(30)),
      ])
    }
    const doc = await prepareScript(
      {
        meta: { title: '', author: '', language: 'en' },
        titlePage: { contact: '', date: '' },
        manuscript: [seq('q', ...tree)],
        loadScene: async (path) => {
          const id = path.split('/')[1]!.replace('.json', '')
          const content = {
            type: 'doc',
            content: elementsByScene.get(id)!.map((e) => ({ type: e.type, content: [{ type: 'text', text: e.text }] })),
          }
          return { ok: true, value: { id, content } as unknown as Scene }
        },
        numbers: new Map(),
      },
      ['q'],
      defaultScriptExportOptions(),
    )
    expect(flatElements(doc)).toHaveLength(48)
    const stats = scriptPageStats([seq('q', ...tree)], (id) => elementsByScene.get(id), opts)
    expect(stats.pages).toBe(scriptPages(doc).length)
  })

  it('handles 1500 scenes quickly', () => {
    const tree = [seq('q', ...Array.from({ length: 1500 }, (_, i) => scene(`s${i}`)))]
    const per = [el('sceneHeading', 'INT. A - DAY'), el('action', 'Some action. '.repeat(6)), el('character', 'bob'), el('dialogue', 'Hi. '.repeat(10))]
    const t0 = performance.now()
    const r = scriptPageStats(tree, () => per, opts)
    expect(r.pages).toBeGreaterThan(100)
    expect(performance.now() - t0).toBeLessThan(1000)
  })
})
