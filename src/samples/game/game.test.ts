import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChecksStore } from '../../checks/store'
import { docxExporter } from '../../export/docx'
import { buildGameDoc } from '../../export/gameDoc'
import { buildGameDocument, defaultGameDocumentOptions, type GameDocumentTexts } from '../../export/gameDocument'
import { gameJsonExporter } from '../../export/gameExporters'
import { parseGameJson } from '../../export/gameJson'
import { toMarkdown } from '../../export/markdown'
import { projectGameSource } from '../../export/source'
import { createMemoryFileIO } from '../../io/fileIO'
import { brokenLinks, resolveLink, type LinkContext } from '../../game/mechanicLinks'
import { advanceStory, chooseStory, followArrow, startStory, viewStory, type StoryState } from '../../game/storyPlaythrough'
import { defaultNames } from '../../project/defaultNames'
import { createMemoryProjectIO, type MemoryProjectIO } from '../../project/io/memory'
import { openProject } from '../../project/open'
import { MECHANIC_STATUSES, mechanicSchema } from '../../project/schemas/mechanic'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../../project/store'
import { resetFileIOFactory, setFileIOFactory } from '../../settings/store'
import { buildStoryModel } from '../../storymap/model'
import { extractLines } from '../../game/playthrough'
import { conversationSchema } from '../../project/schemas/conversation'
import { sceneSchema } from '../../project/schemas/scene'
import { variablesSchema } from '../../project/schemas/variables'
import { storyMapSchema } from '../../project/schemas/storyMap'
import { findNode } from '../../project/tree'
import { sampleDir, SAMPLE_INDEX } from '../build'
import { gameSampleDir } from './build'
import type { SampleLang } from '../text'

const LANGS: SampleLang[] = ['en', 'pl']
const PUBLIC = join(__dirname, '../../../public/samples')
const ONE_FINDING = 'unreachable-node:gate-talk:n-old'

function committed(lang: SampleLang): Record<string, string> {
  const root = join(PUBLIC, gameSampleDir(lang))
  const out: Record<string, string> = {}
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`)
      else if (`${prefix}${name}` !== SAMPLE_INDEX) out[`${prefix}${name}`] = readFileSync(full, 'utf8')
    }
  }
  walk(root, '')
  return out
}

let io: MemoryProjectIO
beforeEach(() => {
  setFileIOFactory(() => createMemoryFileIO())
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

async function openStore(lang: SampleLang) {
  setActivePinia(createPinia())
  io = createMemoryProjectIO(committed(lang))
  setProjectIOFactory(() => io)
  const project = useProjectStore()
  expect(await project.open('sample')).toBe('opened')
  return project
}

const json = <T>(lang: SampleLang, path: string, parse: (v: unknown) => T): T =>
  parse(JSON.parse(committed(lang)[path]!))

describe.each(LANGS)('sample game (%s)', (lang) => {
  it('is its own folder, apart from the book sample', () => {
    expect(gameSampleDir(lang)).toBe(`game-${lang}`)
    expect(gameSampleDir(lang)).not.toBe(sampleDir(lang))
  })

  it('opens at the current version with no missing, invalid or unlisted files', async () => {
    const r = await openProject(createMemoryProjectIO(committed(lang)))
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.issues).toEqual([])
      expect(r.project.readOnly).toBeNull()
      expect(r.project.manifest.kind).toBe('game')
    }
  })

  it('the index lists every file', () => {
    const index = JSON.parse(readFileSync(join(PUBLIC, gameSampleDir(lang), SAMPLE_INDEX), 'utf8'))
    expect(index).toEqual(Object.keys(committed(lang)))
  })

  it('the Checks page shows exactly the one deliberate unreachable node', async () => {
    const project = await openStore(lang)
    const checks = useChecksStore()
    await checks.run()
    expect(checks.findings.map((f) => f.id)).toEqual([ONE_FINDING])
    await project.close()
  })

  it('the key path reaches the end with the key bought and a coin spent', async () => {
    const files = committed(lang)
    const manifest = JSON.parse(files['project.json']!)
    const model = await buildStoryModel(
      {
        manifest,
        loadConversation: async (id) => ({
          ok: true,
          value: conversationSchema.parse(JSON.parse(files[`manuscript/${id}.json`]!)),
        }),
        loadScriptLines: async (id) =>
          extractLines(sceneSchema.parse(JSON.parse(files[`manuscript/${id}.json`]!)).content),
      },
      json(lang, 'story-map.json', (v) => storyMapSchema.parse(v)),
      json(lang, 'variables.json', (v) => variablesSchema.parse(v)).variables,
    )
    const kind = (s: StoryState) => viewStory(s).kind
    let s = startStory(model, { boxId: 'bx-arrival' })
    expect(kind(s)).toBe('script')
    s = advanceStory(s)
    s = followArrow(s, 'a-1')
    expect(kind(s)).toBe('lines')
    s = advanceStory(s)
    const choice = viewStory(s)
    expect(choice.kind === 'choice' && choice.options.map((o) => o.id)).toEqual(['o-pay', 'o-plead', 'o-leave'])
    s = chooseStory(s, 'o-plead')
    s = advanceStory(s)
    s = chooseStory(s, 'o-pay')
    s = advanceStory(s)
    const gate = viewStory(s)
    expect(gate.kind === 'item-end' && gate.arrows.map((a) => a.id)).toEqual(['a-2'])
    s = followArrow(s, 'a-2')
    s = advanceStory(s)
    s = followArrow(s, 'a-5')
    expect(kind(s)).toBe('beat')
    s = advanceStory(s)
    expect(kind(s)).toBe('end')
    expect(s.values).toEqual({ 'v-key': true, 'v-coins': 4, 'v-trust': 1 })
  })

  it('walking away leaves the key behind and opens only the alley', async () => {
    const files = committed(lang)
    const model = await buildStoryModel(
      {
        manifest: JSON.parse(files['project.json']!),
        loadConversation: async (id) => ({
          ok: true,
          value: conversationSchema.parse(JSON.parse(files[`manuscript/${id}.json`]!)),
        }),
        loadScriptLines: async () => [],
      },
      json(lang, 'story-map.json', (v) => storyMapSchema.parse(v)),
      json(lang, 'variables.json', (v) => variablesSchema.parse(v)).variables,
    )
    let s = startStory(model, { itemId: 'gate-talk' })
    s = advanceStory(s)
    s = chooseStory(s, 'o-leave')
    s = advanceStory(s)
    const v = viewStory(s)
    expect(v.kind === 'item-end' && v.arrows.map((a) => a.id)).toEqual(['a-3'])
    expect(s.values).toEqual({ 'v-key': false, 'v-coins': 5, 'v-trust': 0 })
  })

  it('game JSON export re-reads to the same graph', async () => {
    const project = await openStore(lang)
    const doc = await buildGameDoc(projectGameSource()!)
    const back = parseGameJson(new TextDecoder().decode(await gameJsonExporter.export(doc)))
    expect(back).toEqual({ ok: true, doc })
    expect(doc.variables).toHaveLength(3)
    expect(doc.items.map((i) => i.type)).toEqual(['folder', 'script', 'conversation', 'script', 'folder', 'script'])
    expect(doc.storyMap.boxes).toHaveLength(5)
    expect(doc.storyMap.arrows).toHaveLength(5)
    expect(doc.routes).toHaveLength(1)
    expect(doc.items.find((i) => i.id === 'alley')?.routes).toHaveLength(1)
    await project.close()
  })

  it('the document export has the Overview, every mechanic and the glossary', async () => {
    const project = await openStore(lang)
    const source = projectGameSource()!
    const texts: GameDocumentTexts = {
      overview: 'Overview',
      glossary: 'Glossary',
      uncategorized: 'No category',
      untitled: 'Untitled',
      missing: 'MISSING-LINK',
      status: { idea: 'Idea', designed: 'Designed', implemented: 'Implemented', cut: 'Cut' },
      tags: 'Tags',
      parameters: 'Parameters',
      links: 'Links',
    }
    const doc = buildGameDocument(source, defaultGameDocumentOptions(), texts)
    const md = toMarkdown(doc)
    expect(md).toContain('Overview')
    for (const h of defaultNames(lang).overviewHeadings) expect(md).toContain(h)
    for (const m of source.mechanics) expect(md).toContain(m.title)
    expect(md).toContain('Glossary')
    for (const g of source.glossary) expect(md).toContain(g.term)
    expect(md).not.toContain('MISSING-LINK')
    const docx = await docxExporter.export(doc)
    expect(new TextDecoder().decode(docx.slice(0, 2))).toBe('PK')
    await project.close()
  })

  it('every mechanic link resolves, and the mechanics span categories and statuses', () => {
    const files = committed(lang)
    const manifest = JSON.parse(files['project.json']!)
    const mechanics = manifest.mechanics.map((r: { path: string }) =>
      mechanicSchema.parse(JSON.parse(files[r.path]!)),
    )
    const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id))
    const live = (s: Set<string>) => ({ live: s, trashed: new Set<string>() })
    const ctx: LinkContext = {
      variable: live(ids(json(lang, 'variables.json', (v) => variablesSchema.parse(v)).variables)),
      item: live(new Set(['arrival', 'gate-talk', 'alley', 'tower'].filter((i) => findNode(manifest.manuscript, i)))),
      beat: live(ids(json(lang, 'story-map.json', (v) => storyMapSchema.parse(v)).boxes)),
      entry: live(ids(manifest.codexEntries)),
      mechanic: live(ids(mechanics)),
    }
    expect(mechanics.length).toBeGreaterThanOrEqual(4)
    const kinds = new Set<string>()
    for (const m of mechanics) {
      expect(brokenLinks(m, ctx)).toEqual([])
      for (const l of m.links) {
        expect(resolveLink(l, ctx)).toEqual({ ok: true })
        kinds.add(l.kind)
      }
    }
    expect([...kinds].sort()).toEqual(['beat', 'entry', 'item', 'mechanic', 'variable'])
    expect(new Set(mechanics.map((m: { status: string }) => m.status))).toEqual(new Set(MECHANIC_STATUSES))
    expect(new Set(mechanics.map((m: { categoryId: string }) => m.categoryId)).size).toBeGreaterThanOrEqual(3)
  })

  it('has a filled Overview under every starter heading and 4 to 6 glossary terms', () => {
    const overview = JSON.parse(committed(lang)['game-doc/overview.json']!).content.content as {
      type: string
      content?: { text?: string }[]
    }[]
    const headings = overview.filter((n) => n.type === 'heading').map((n) => n.content?.[0]?.text)
    expect(headings).toEqual(defaultNames(lang).overviewHeadings)
    expect(overview.filter((n) => n.type === 'paragraph' && !n.content?.length)).toEqual([])
    const glossary = JSON.parse(committed(lang)['game-doc/glossary.json']!).entries
    expect(glossary.length).toBeGreaterThanOrEqual(4)
    expect(glossary.length).toBeLessThanOrEqual(6)
  })
})
