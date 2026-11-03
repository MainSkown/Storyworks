// Builds a long book through the real project writer (schemas + atomic saves into a memory folder).
// Used by scripts/perf-m11.mjs (loaded through vite's ssrLoadModule) and src/project/longBook.test.ts.
import { countWords } from '../src/editor/wordCount'
import { createMemoryProjectIO } from '../src/project/io/memory'
import { createProject, openProject } from '../src/project/open'
import { ensureDefaults } from '../src/project/timelines'
import { codexEntryPath, seedCodexTypes } from '../src/project/codex'
import { seedRelationTypes, relationshipPath } from '../src/project/relations'
import { seedRuleCategories, rulePath } from '../src/project/rules'
import { seedStateKinds } from '../src/project/states'
import { knowledgePath } from '../src/project/knowledge'
import { CODEX_KIND, EVENT_KIND, type Link } from '../src/project/links'
import { CODEX_ENTRY_VERSION, codexEntrySchema } from '../src/project/schemas/codexEntry'
import { KNOWLEDGE_VERSION, knowledgeItemSchema } from '../src/project/schemas/knowledge'
import { RELATIONSHIP_VERSION, relationshipSchema } from '../src/project/schemas/relationship'
import { RULE_VERSION, ruleSchema } from '../src/project/schemas/rule'
import { SCENE_VERSION, sceneSchema } from '../src/project/schemas/scene'
import { timelineSchema, TIMELINE_VERSION, type TimelineNode } from '../src/timeline/schema'
import type { Env } from '../src/project/types'

export interface FixtureSize {
  parts: number
  chapters: number
  scenes: number
  words: number
  entries: number
  timelines: number
  nodesPerTimeline: number
  rules: number
  knowledge: number
}

/** 10 x 15 x 10 = 1 500 scenes of ~200 words = ~300 000 words. */
export const FULL_SIZE: FixtureSize = {
  parts: 10,
  chapters: 15,
  scenes: 10,
  words: 200,
  entries: 200,
  timelines: 3,
  nodesPerTimeline: 100,
  rules: 30,
  knowledge: 20,
}

export interface Fixture {
  files: Record<string, string>
  sceneIds: string[]
  scenePaths: string[]
  entryNames: string[]
  totalWords: number
}

let seed = 17
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
const VOCAB =
  'the road ran beyond river stone light shadow window door night morning silence voice hand walked turned said knew never always small heavy cold bright slow quick after before under over between city gate market harbour lamp rain wind map letter bread salt thread'.split(
    ' ',
  )
const FIRST =
  'Aldric Brenna Corin Dessa Edrin Farah Gareth Helka Ivor Jessa Kellen Liora Marek Nessa Orin Petra Quill Rhea Soren Talia Ulric Vera Wren Xander Yara Zane'.split(
    ' ',
  )
const LAST = 'Voss Harrow Thorne Reeds Ashby Marsh Stone Vale Wick Crane Hale Ford'.split(' ')

const doc = (...paras: string[]) => ({
  type: 'doc',
  content: paras.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
})

function words(n: number, mention?: string): string {
  const w = Array.from({ length: n }, () => VOCAB[Math.floor(rnd() * VOCAB.length)])
  if (mention) w[Math.floor(rnd() * n)] = mention
  w[0] = w[0][0].toUpperCase() + w[0].slice(1)
  return w.join(' ') + '.'
}

export async function buildFixture(size: FixtureSize = FULL_SIZE): Promise<Fixture> {
  seed = 17
  let counter = 0
  const env: Env = { now: () => Date.UTC(2026, 10, 1), newId: () => `d${++counter}` }
  const io = createMemoryProjectIO()
  const project = await createProject(
    io,
    { title: 'The Long Book', author: 'Perf Tester', language: 'en' },
    env,
  )
  const m = project.manifest
  await ensureDefaults(project, env)
  await seedRuleCategories(project, env)
  await seedCodexTypes(project, env)
  await seedRelationTypes(project, env)
  await seedStateKinds(project, env)
  const cat = m.ruleCategories[0].id
  const [typeCharacter] = m.codexTypes
  const kindId = m.stateKinds[0].id

  // Codex: entries with one alias (first name), two states, a rule each.
  const entryNames = Array.from(
    { length: size.entries },
    (_, i) =>
      `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}${i >= FIRST.length * LAST.length ? ` ${i}` : ''}`,
  )
  const entryIds = entryNames.map((_, i) => `e${i}`)
  const ruleIds = Array.from({ length: size.rules }, (_, i) => `r${i}`)

  // Timelines: a chain of dated nodes each (dates run on across timelines).
  const tlIds = Array.from({ length: size.timelines }, (_, i) => `tl${i}`)
  const nodeIds: { tl: string; id: string }[] = []
  for (const old of m.timelines) await io.remove(old.path)
  m.timelines = []
  for (let t = 0; t < size.timelines; t++) {
    const nodes: TimelineNode[] = Array.from({ length: size.nodesPerTimeline }, (_, i) => {
      const id = `n${t}-${i}`
      nodeIds.push({ tl: tlIds[t], id })
      return {
        id,
        title: `Event ${t}.${i}`,
        description: doc(words(20)),
        date: { year: 1850 + Math.floor(i / 6), month: 1 + (i % 12), day: 1 + (i % 27) },
        color: null,
        tag: null,
        branchId: null,
        pos: { x: i * 220, y: t * 160 },
        codexIds: [entryIds[(i * 3) % size.entries], entryIds[(i * 7 + 1) % size.entries]],
        ruleIds: [ruleIds[i % size.rules]],
      }
    })
    const timeline = timelineSchema.parse({
      version: TIMELINE_VERSION,
      id: tlIds[t],
      name: `Timeline ${t + 1}`,
      view: 'flow',
      branches: [],
      nodes,
      edges: nodes.slice(1).map((n, i) => ({ id: `ed${t}-${i}`, from: nodes[i].id, to: n.id })),
    })
    const path = `timelines/${tlIds[t]}.json`
    await project.saveItem(path, timelineSchema, timeline)
    m.timelines.push({ id: tlIds[t], path, title: timeline.name })
  }

  m.rules = []
  for (const id of ruleIds) {
    const path = rulePath(id)
    await project.saveItem(path, ruleSchema, {
      version: RULE_VERSION,
      id,
      title: `Rule ${id}`,
      categoryId: cat,
      description: doc(words(60), words(40)),
      tags: [],
      exceptions: doc(words(20)),
    })
    m.rules.push({ id, path, title: `Rule ${id}` })
  }

  const here = (i: number) => ({ node: { timelineId: nodeIds[i].tl, nodeId: nodeIds[i].id } })
  m.codexEntries = []
  for (let i = 0; i < size.entries; i++) {
    const path = codexEntryPath(entryIds[i])
    const startAt = (i * 5) % nodeIds.length
    await project.saveItem(path, codexEntrySchema, {
      version: CODEX_ENTRY_VERSION,
      id: entryIds[i],
      typeId: typeCharacter.id,
      name: entryNames[i],
      aliases: [entryNames[i].split(' ')[0]],
      image: null,
      notes: doc(words(80)),
      tags: [],
      ruleIds: [ruleIds[i % size.rules]],
      appendixText: words(30),
      includeInAppendices: i % 2 === 0,
      states: [
        {
          id: `st${i}a`,
          kindId,
          value: `Place ${i}`,
          from: here(startAt),
          until: here((startAt + 3) % nodeIds.length),
          final: false,
        },
        {
          id: `st${i}b`,
          kindId,
          value: `Place ${i + 1}`,
          from: here((startAt + 4) % nodeIds.length),
          until: null,
          final: false,
        },
      ],
    })
    m.codexEntries.push({ id: entryIds[i], path, title: entryNames[i] })
  }

  m.relationships = []
  for (let i = 0; i < size.entries * 0.75; i++) {
    const id = `rel${i}`
    const path = relationshipPath(id)
    await project.saveItem(path, relationshipSchema, {
      version: RELATIONSHIP_VERSION,
      id,
      fromId: entryIds[i % size.entries],
      toId: entryIds[(i * 11 + 3) % size.entries],
      typeId: m.relationTypes[i % m.relationTypes.length].id,
      note: doc(),
      nodeRef: null,
    })
    m.relationships.push({ id, path })
  }

  // Manuscript.
  const sceneIds: string[] = []
  const scenePaths: string[] = []
  let totalWords = 0
  let n = 0
  const STATUS = [
    'idea',
    'draft',
    'draft',
    'draft',
    'draft',
    'draft',
    'revising',
    'revising',
    'final',
    'final',
  ] as const
  const manuscript: typeof m.manuscript = []
  const sceneDocs: { id: string; path: string; scene: unknown }[] = []
  for (let p = 1; p <= size.parts; p++) {
    const part = {
      id: `p${p}`,
      type: 'part' as const,
      title: `Part ${p}`,
      children: [] as typeof m.manuscript,
    }
    for (let c = 1; c <= size.chapters; c++) {
      const ch = {
        id: `c${p}-${c}`,
        type: 'chapter' as const,
        title: `Chapter ${p}.${c}`,
        children: [] as typeof m.manuscript,
      }
      for (let s = 1; s <= size.scenes; s++) {
        const idx = n++
        const id = `s${idx}`
        const path = `manuscript/${id}.json`
        const blocks = []
        let left = size.words
        let b = 0
        while (left > 0) {
          const k = Math.min(left, 30 + Math.floor(rnd() * 40))
          const mention =
            rnd() < 0.2 ? entryNames[Math.floor(rnd() * size.entries)].split(' ')[0] : undefined
          blocks.push({
            type: 'paragraph',
            attrs: { id: `${id}-b${b++}` },
            content: [{ type: 'text', text: words(k, mention) }],
          })
          left -= k
        }
        blocks[0].content[0].text = `Marker${idx}z ${blocks[0].content[0].text}`
        const content = { type: 'doc', content: blocks }
        const count = countWords(content)
        totalWords += count
        const nodeAt = idx % nodeIds.length
        const links: Link[] = [
          {
            id: `${id}-ev`,
            kind: EVENT_KIND,
            from: { item: id, block: `${id}-b0` },
            to: { item: nodeIds[nodeAt].tl, block: nodeIds[nodeAt].id },
          },
          {
            id: `${id}-cx0`,
            kind: CODEX_KIND,
            from: { item: id, block: `${id}-b0` },
            to: { item: entryIds[idx % size.entries] },
          },
          {
            id: `${id}-cx1`,
            kind: CODEX_KIND,
            from: { item: id, block: `${id}-b${Math.min(1, blocks.length - 1)}` },
            to: { item: entryIds[(idx * 7 + 2) % size.entries] },
          },
        ]
        sceneDocs.push({
          id,
          path,
          scene: {
            version: SCENE_VERSION,
            id,
            title: `Scene ${idx + 1}`,
            status: STATUS[idx % STATUS.length],
            synopsis: idx % 3 === 0 ? '' : words(14),
            povId: entryIds[idx % size.entries],
            wordCount: count,
            content,
            todos: idx % 50 === 0 ? [{ id: `${id}-t`, text: 'Fix', done: false }] : [],
            comments: [],
            links,
          },
        })
        ch.children.push({ id, type: 'scene', title: `Scene ${idx + 1}`, path, children: [] })
        sceneIds.push(id)
        scenePaths.push(path)
      }
      part.children.push(ch)
    }
    manuscript.push(part)
  }
  await io.remove(m.manuscript[0].children[0].path as string)
  m.manuscript = manuscript
  for (const d of sceneDocs) await project.saveItem(d.path, sceneSchema, d.scene as never)

  // Knowledge items learned by a few entries, revealed in scenes.
  m.knowledge = []
  for (let k = 0; k < size.knowledge; k++) {
    const id = `k${k}`
    await project.saveItem(knowledgePath(id), knowledgeItemSchema, {
      version: KNOWLEDGE_VERSION,
      id,
      title: `Secret ${k}`,
      description: doc(words(30)),
      tags: [],
      about: { type: 'rule', id: ruleIds[k % size.rules] },
      learnings: [
        {
          id: `${id}-l`,
          entryId: entryIds[k],
          at: here((k * 9) % nodeIds.length),
          note: '',
          forgottenAt: null,
          revealedIn: null,
        },
      ],
    })
    m.knowledge.push({ id, path: knowledgePath(id), title: `Secret ${k}` })
  }

  await project.saveManifest()
  const opened = await openProject(io, env)
  if (opened.status !== 'ok') throw new Error(`Fixture does not open: ${JSON.stringify(opened)}`)
  const files: Record<string, string> = {}
  for (const [path, text] of io.files) files[path] = text
  return { files, sceneIds, scenePaths, entryNames, totalWords }
}
