import { afterEach, beforeEach, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO } from './io/memory'
import { sceneSchema, SCENE_VERSION } from './schemas/scene'
import { manifestSchema, MANIFEST_VERSION } from './schemas/manifest'
import { serialize } from './serialize'
import { buildIndex } from '../search/build'
import { search } from '../search/query'
import { switchTo } from '../search/switcher'
import { findMentions } from '../codex/mentions'
import { positionsByBlock } from '../knowledge/uses'
import type { Link } from './links'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from './store'

const SCENES = 1500
const WORDS = 200

beforeEach(() => {
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

// Guards against accidental O(n^2) work when a book with hundreds of scenes opens.
it('opens a 1500-scene, 300k-word book in well under 3 s', async () => {
  const text = Array.from({ length: WORDS }, (_, i) => `w${i}`).join(' ')
  const files: Record<string, string> = {}
  const chapters = Array.from({ length: SCENES / 5 }, (_, c) => ({
    id: `c${c}`,
    type: 'chapter' as const,
    title: `Chapter ${c}`,
    children: Array.from({ length: 5 }, (_, k) => {
      const id = `s${c * 5 + k}`
      const path = `manuscript/${id}.json`
      files[path] = serialize(sceneSchema, {
        version: SCENE_VERSION,
        id,
        title: id,
        status: 'draft',
        synopsis: '',
        wordCount: WORDS,
        content: {
          type: 'doc',
          content: [
            { type: 'paragraph', attrs: { id: `p${id}` }, content: [{ type: 'text', text }] },
          ],
        },
        todos: [],
        comments: [],
        links: [],
      })
      return { id, type: 'scene' as const, title: id, path, children: [] }
    }),
  }))
  files['project.json'] = serialize(
    manifestSchema,
    manifestSchema.parse({
      version: MANIFEST_VERSION,
      kind: 'book',
      title: 'Long',
      author: 'A',
      language: 'en',
      createdAt: '2026-01-01T00:00:00.000Z',
      manuscript: chapters,
    }),
  )
  const io = createMemoryProjectIO(files)
  setProjectIOFactory(() => io)
  setActivePinia(createPinia())
  const s = useProjectStore()

  const t0 = performance.now()
  expect(await s.open('book')).toBe('opened')
  const ms = performance.now() - t0

  expect(s.wordCounts.get('')).toBe(SCENES * WORDS)
  expect(ms).toBeLessThan(3000)
  await s.close()
})

// Budgets on the pure parts, with ~10x headroom over what scripts/perf-m11.mjs measures, so they only trip on a real regression.
const paragraph = (id: string, text: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
})
const sceneDoc = (i: number) => ({
  type: 'doc',
  content: Array.from({ length: 4 }, (_, b) =>
    paragraph(`s${i}-b${b}`, `${'the road ran beyond the river '.repeat(8)}Kellen walked on ${i}`),
  ),
})

it('searches and switches over a 1500-scene index well under 100 ms per query', () => {
  const content = new Map(Array.from({ length: SCENES }, (_, i) => [`s${i}`, sceneDoc(i)]))
  const tree = Array.from({ length: SCENES / 10 }, (_, c) => ({
    id: `c${c}`,
    type: 'chapter' as const,
    title: `Chapter ${c}`,
    children: Array.from({ length: 10 }, (_, k) => {
      const id = `s${c * 10 + k}`
      return { id, type: 'scene' as const, title: id, path: `manuscript/${id}.json`, children: [] }
    }),
  }))
  const ix = buildIndex({
    tree,
    sceneContent: content,
    rules: [],
    timelines: [],
    entries: [],
    knowledge: [],
  })
  const worst = (fn: () => unknown) => {
    let w = 0
    for (let i = 0; i < 5; i++) {
      const t = performance.now()
      fn()
      w = Math.max(w, performance.now() - t)
    }
    return w
  }
  const all = { limit: Number.MAX_SAFE_INTEGER } // as the app asks
  expect(search(ix, 'kellen', all).groups[0].hits.length).toBe(SCENES)
  expect(worst(() => search(ix, 'kellen walked', all))).toBeLessThan(250)
  expect(worst(() => search(ix, 'e', all))).toBeLessThan(250)
  expect(worst(() => switchTo(ix, 's14', []))).toBeLessThan(250)
})

it('scans a 1500-scene book for mentions under 1 s', () => {
  const scenes = Array.from({ length: SCENES }, (_, i) => ({ id: `s${i}`, content: sceneDoc(i) }))
  const t = performance.now()
  const found = findMentions(
    { id: 'e1', name: 'Kellen Voss', aliases: ['Kellen'] },
    scenes,
    [],
    new Set(),
  )
  expect(found.length).toBe(SCENES * 4)
  expect(performance.now() - t).toBeLessThan(1000)
})

it('looks up passage positions for thousands of uses in linear time', () => {
  const links: Link[] = Array.from({ length: 12000 }, (_, i) => ({
    id: `l${i}`,
    kind: 'event',
    from: { item: `s${i % 3000}`, block: `b${i % 4}` },
    to: { item: 'tl', block: `n${i % 300}` },
  }))
  const t = performance.now()
  const lookup = positionsByBlock(links)
  let total = 0
  for (let i = 0; i < 6000; i++) total += lookup(`s${i % 3000}`, `b${i % 4}`).length
  expect(total).toBeGreaterThan(0)
  expect(performance.now() - t).toBeLessThan(300)
})
