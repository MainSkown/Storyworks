import { afterEach, beforeEach, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO } from './io/memory'
import { sceneSchema, SCENE_VERSION } from './schemas/scene'
import { manifestSchema } from './schemas/manifest'
import { serialize } from './serialize'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from './store'

const SCENES = 500
const WORDS = 600

beforeEach(() => {
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

// Guards against accidental O(n^2) work when a book with hundreds of scenes opens.
it('opens a 500-scene, 300k-word book in well under 3 s', async () => {
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
          content: [{ type: 'paragraph', attrs: { id: `p${id}` }, content: [{ type: 'text', text }] }],
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
      version: 2,
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
