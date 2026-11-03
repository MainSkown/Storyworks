import { describe, expect, it } from 'vitest'
import { applyImport } from './apply'
import { buildFountainPlan, fountainDoc } from './fountainPlan'
import { parseFountain } from './fountain'
import { createMemoryProjectIO } from '../project/io/memory'
import type { ImportTarget } from './apply'

const SAMPLE = `# Act one

INT. KAWIARNIA - DZIEŃ

Anna wchodzi.

ANNA
(cicho)
Dzień dobry.

EXT. RYNEK - NOC

Pada deszcz.

# Act two

INT. DOM - DZIEŃ

Cisza.
`
const opts = { fileBase: 'Script', sceneName: (n: number) => `Scene ${n}`, sequenceName: (n: number) => `Sequence ${n}` }

describe('fountainDoc', () => {
  it('turns elements into typed blocks, line breaks into hard breaks', () => {
    expect(fountainDoc([{ type: 'dialogue', text: 'a\nb' }])).toEqual({
      type: 'doc',
      content: [{ type: 'dialogue', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] }],
    })
  })
  it('gives an empty element no content node', () => {
    expect(fountainDoc([{ type: 'action', text: '' }]).content).toEqual([{ type: 'action' }])
  })
})

describe('buildFountainPlan', () => {
  it('makes a sequence per section and a scene per heading, titled by the heading', () => {
    const plan = buildFountainPlan(parseFountain(SAMPLE), opts)
    expect(plan.chapters.map((c) => [c.title, c.scenes.map((s) => s.title)])).toEqual([
      ['Act one', ['INT. KAWIARNIA - DZIEŃ', 'EXT. RYNEK - NOC']],
      ['Act two', ['INT. DOM - DZIEŃ']],
    ])
    expect(plan.chapters.every((c) => c.included)).toBe(true)
    expect(plan.chapters[0]!.scenes[0]!.words).toBeGreaterThan(0)
  })

  it('names untitled sequences and scenes', () => {
    const plan = buildFountainPlan(parseFountain('Just text.\n\nMore text.'), opts)
    expect(plan.chapters.map((c) => c.title)).toEqual(['Script'])
    expect(plan.chapters[0]!.scenes.map((s) => s.title)).toEqual(['Scene 1'])
  })

  it('keeps the placement and lets the user skip and rename', () => {
    const base = buildFountainPlan(parseFountain(SAMPLE), opts)
    const id = base.chapters[1]!.id
    const plan = buildFountainPlan(parseFountain(SAMPLE), {
      ...opts,
      placement: { kind: 'after', id: 'x' },
      edits: { skipped: [id], titles: { [base.chapters[0]!.id]: 'Renamed' } },
    })
    expect(plan.placement).toEqual({ kind: 'after', id: 'x' })
    expect(plan.chapters[1]!.included).toBe(false)
    expect(plan.chapters[0]!.title).toBe('Renamed')
  })
})

describe('applying a Fountain plan', () => {
  it('creates sequences and scenes whose blocks all have fresh ids', async () => {
    const plan = buildFountainPlan(parseFountain(SAMPLE), opts)
    const made: { parent: string | null; title: string; content?: Record<string, unknown> }[] = []
    let n = 0
    const target: ImportTarget = {
      tree: [],
      projectIO: () => createMemoryProjectIO(),
      flush: async () => {},
      addChapter: async (parent, title) => (made.push({ parent, title }), `c${++n}`),
      addScene: async (parent, title, init) => (made.push({ parent, title, content: init?.content }), `s${++n}`),
      moveItem: async () => true,
      addAsset: async () => '',
    }
    const r = await applyImport(target, plan, [], { env: { now: () => 0, newId: (() => { let i = 0; return () => `id${++i}` })() } })
    expect(r.chapters).toBe(2)
    expect(r.scenes).toBe(3)
    const blocks = made.flatMap((m) => ((m.content?.content as { attrs?: { id?: string } }[]) ?? []))
    expect(blocks.length).toBeGreaterThan(5)
    expect(new Set(blocks.map((b) => b.attrs?.id)).size).toBe(blocks.length)
  })
})
