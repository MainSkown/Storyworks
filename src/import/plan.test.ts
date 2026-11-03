import { describe, expect, it } from 'vitest'
import type { ManuscriptNode } from '../project/schemas/manifest'
import { buildPlan, loadImport, resolvePlacement, type ImportFile, type LoadedImport } from './plan'

const file = (name: string, text: string): ImportFile => ({ name, bytes: new TextEncoder().encode(text) })

function load(...files: ImportFile[]): LoadedImport {
  const r = loadImport(files)
  if (!r.ok) throw new Error('load failed')
  return r.loaded
}

const BOOK = '# Alpha\n\none two three\n\n## S1\n\nfour five\n\n## S2\n\nsix'

describe('loadImport', () => {
  it('rejects the whole import when any file is not UTF-8, naming it', () => {
    const bad: ImportFile = { name: 'bad.md', bytes: new Uint8Array([0xff, 0xfe, 0x41]) }
    const r = loadImport([file('ok.md', '# A'), bad])
    expect(r).toEqual({ ok: false, errors: [{ file: 'bad.md', code: 'invalid-utf8' }] })
  })
})

describe('buildPlan', () => {
  it('names chapters from the first H1, else from the file name', () => {
    const plan = buildPlan(load(file('book.md', BOOK), file('notes.txt', 'plain words')), { rule: 'h1h2' })
    expect(plan.chapters.map((c) => c.title)).toEqual(['Alpha', 'notes'])
  })

  it('counts words per scene and chapter and names untitled scenes', () => {
    const [ch] = buildPlan(load(file('book.md', BOOK)), { rule: 'h1h2' }).chapters
    expect(ch!.scenes.map((s) => [s.title, s.words])).toEqual([['Scene 1', 3], ['S1', 2], ['S2', 1]])
    expect(ch!.words).toBe(6)
  })

  it('uses the same item ids when the plan is rebuilt', () => {
    const loaded = load(file('book.md', BOOK))
    const ids = (p: ReturnType<typeof buildPlan>) => p.chapters.flatMap((c) => [c.id, ...c.scenes.map((s) => s.id)])
    expect(ids(buildPlan(loaded, { rule: 'h1h2' }))).toEqual(ids(buildPlan(loaded, { rule: 'h1h2' })))
  })

  it('keeps renames and skips across a rebuild with another rule', () => {
    const loaded = load(file('book.md', BOOK))
    const first = buildPlan(loaded, { rule: 'h1h2' })
    const cid = first.chapters[0]!.id
    const sid = first.chapters[0]!.scenes[1]!.id
    const again = buildPlan(loaded, { rule: 'h1h2', edits: { titles: { [cid]: 'Renamed' }, skipped: [sid] } })
    expect(again.chapters[0]!.title).toBe('Renamed')
    expect(again.chapters[0]!.scenes[1]!.included).toBe(false)
    expect(again.chapters[0]!.words).toBe(4) // skipped scene not counted
  })

  it('warns about remote images and lists local ones', () => {
    const plan = buildPlan(
      load(file('a.md', '![x](http://e.com/a.png)\n\n![y](pics/y.png)')),
      { rule: 'h1h2' },
    )
    expect(plan.warnings).toEqual([{ code: 'remote-image', file: 'a.md', ref: 'http://e.com/a.png' }])
    expect(plan.images).toEqual([{ file: 0, ref: 'pics/y.png' }])
  })
})

const tree: ManuscriptNode[] = [
  { id: 'p1', type: 'part', title: 'P', children: [
    { id: 'c1', type: 'chapter', title: 'C1', children: [{ id: 's1', type: 'scene', title: 'S', path: 'x', children: [] }] },
    { id: 'c2', type: 'chapter', title: 'C2', children: [] },
  ] },
  { id: 'c3', type: 'chapter', title: 'C3', children: [] },
]

describe('resolvePlacement', () => {
  it('appends at the end of the tree', () => {
    expect(resolvePlacement(tree, { kind: 'end' })).toEqual({ parentId: null, index: 2 })
  })

  it('goes after the selected chapter, inside its part', () => {
    expect(resolvePlacement(tree, { kind: 'after', id: 'c1' })).toEqual({ parentId: 'p1', index: 1 })
  })

  it('goes after the chapter holding the selected scene', () => {
    expect(resolvePlacement(tree, { kind: 'after', id: 's1' })).toEqual({ parentId: 'p1', index: 1 })
  })

  it('goes after a selected part at the root; unknown id appends', () => {
    expect(resolvePlacement(tree, { kind: 'after', id: 'p1' })).toEqual({ parentId: null, index: 1 })
    expect(resolvePlacement(tree, { kind: 'after', id: 'nope' })).toEqual({ parentId: null, index: 2 })
  })
})
