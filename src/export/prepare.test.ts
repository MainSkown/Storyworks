import { describe, expect, it } from 'vitest'
import { defaultExportOptions } from './options'
import { prepareExport, type ExportSource } from './prepare'
import type { Scene } from '../project/schemas/scene'
import { gregorianCalendar } from '../calendar'

const scene = (id: string, content: unknown[]): Scene =>
  ({
    version: 3,
    id,
    title: id,
    status: 'draft',
    synopsis: '',
    wordCount: 0,
    content: { type: 'doc', content },
    todos: [],
    comments: [],
    links: [],
  }) as Scene

const img = { type: 'image', attrs: { src: 'assets/a.png' } }
const para = { type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }

function source(over: Partial<ExportSource> = {}): ExportSource {
  const scenes: Record<string, Scene> = { s1: scene('s1', [para, img]), s2: scene('s2', [para]) }
  return {
    meta: { title: 'T', author: 'A', language: 'en' },
    manuscript: [
      {
        id: 'c1',
        type: 'chapter',
        title: 'One',
        children: [
          { id: 's1', type: 'scene', title: 's1', path: 'manuscript/s1.json', children: [] },
        ],
      },
      {
        id: 'c2',
        type: 'chapter',
        title: 'Two',
        children: [
          { id: 's2', type: 'scene', title: 's2', path: 'manuscript/s2.json', children: [] },
        ],
      },
    ],
    loadScene: async (path) => {
      const id = path.split('/').pop()!.replace('.json', '')
      return scenes[id]
        ? { ok: true, value: scenes[id] }
        : { ok: false, message: `${path} missing` }
    },
    readAsset: async () => null,
    entries: [],
    links: [],
    timelines: [],
    calendar: gregorianCalendar('gregorian'),
    appendixTexts: {
      titles: { personae: 'P', glossary: 'G', chronology: 'C' },
      labels: { firstAppearance: 'First' },
    },
    ...over,
  }
}

describe('prepareExport', () => {
  it('builds only the selected chapters', async () => {
    const doc = await prepareExport(source(), ['c2'], defaultExportOptions())
    expect(doc.chapters.map((c) => c.title)).toEqual(['Two'])
  })

  it('preloads image bytes so the builder finds them', async () => {
    const bytes = Uint8Array.from([1, 2, 3])
    const doc = await prepareExport(
      source({ readAsset: async () => bytes }),
      ['c1'],
      defaultExportOptions(),
    )
    expect(doc.warnings).toEqual([])
  })

  it('warns about a missing image', async () => {
    const doc = await prepareExport(source(), ['c1'], defaultExportOptions())
    expect(doc.warnings).toEqual([{ kind: 'missingImage', detail: 'assets/a.png' }])
  })

  it('blocks when nothing is selected', async () => {
    await expect(prepareExport(source(), [], defaultExportOptions())).rejects.toThrow(
      'nothingSelected',
    )
  })

  it('reports an unreadable scene file instead of exporting a hole', async () => {
    const s = source({ loadScene: async () => ({ ok: false, message: 'bad json' }) })
    await expect(prepareExport(s, ['c1'], defaultExportOptions())).rejects.toThrow(
      'sceneUnreadable',
    )
  })
})
