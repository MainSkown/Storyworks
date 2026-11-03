import { countWords } from '../editor/wordCount'
import { createMemoryProjectIO } from '../project/io/memory'
import { createProject, openProject } from '../project/open'
import { ensureDefaults } from '../project/timelines'
import { codexEntryPath, seedCodexTypes } from '../project/codex'
import { seedRelationTypes, relationshipPath } from '../project/relations'
import { seedRuleCategories, rulePath } from '../project/rules'
import { seedStateKinds } from '../project/states'
import { knowledgePath } from '../project/knowledge'
import { CODEX_KIND, EVENT_KIND, KNOWLEDGE_KIND, type Link } from '../project/links'
import { CODEX_ENTRY_VERSION, codexEntrySchema } from '../project/schemas/codexEntry'
import { KNOWLEDGE_VERSION, knowledgeItemSchema } from '../project/schemas/knowledge'
import { RELATIONSHIP_VERSION, relationshipSchema } from '../project/schemas/relationship'
import { RULE_VERSION, ruleSchema } from '../project/schemas/rule'
import { SCENE_VERSION, sceneSchema } from '../project/schemas/scene'
import { timelineSchema, TIMELINE_VERSION, type TimelineNode } from '../timeline/schema'
import type { Env } from '../project/types'
import { SAMPLE_TEXT, type SampleLang } from './text'

export const SAMPLE_INDEX = 'index.json'
export const sampleDir = (lang: SampleLang) => `book-${lang}`

type Doc = Record<string, unknown>
const doc = (...paras: string[]): Doc => ({
  type: 'doc',
  content: paras.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
})

const TL = 'tl-main'
const nodeRef = (nodeId: string) => ({ node: { timelineId: TL, nodeId } })

/** Which scene belongs to which event, with the passage (paragraph index) that carries the link. */
const SCENES = [
  { key: 's1', chapter: 0, node: 'n1', status: 'final', codex: [[0, 'mara'], [1, 'lighthouse']] },
  { key: 's2', chapter: 0, node: 'n1', status: 'final', codex: [[1, 'lantern']] },
  { key: 's3', chapter: 1, node: 'n2', status: 'draft', codex: [[0, 'mara']] },
  { key: 's4', chapter: 1, node: 'n2', status: 'draft', codex: [[1, 'tobias']] },
  { key: 's5', chapter: 2, node: 'n3a', status: 'draft', codex: [[0, 'tobias']] },
  { key: 's6', chapter: 2, node: 'n3b', status: 'revising', codex: [[1, 'lantern']] },
  { key: 's7', chapter: 3, node: 'n4', status: 'idea', codex: [[1, 'tobias']] },
  { key: 's8', chapter: 3, node: 'n4', status: 'idea', codex: [[0, 'mara']] },
] as const

const EVENT_PARA: Record<string, number> = { s6: 1 }
const blockId = (scene: string, i: number) => `${scene}-p${i}`

/** Builds the sample book for one language as `path -> file text`, with fixed ids and dates. */
export async function buildSample(lang: SampleLang): Promise<Record<string, string>> {
  const tx = SAMPLE_TEXT[lang]
  let counter = 0
  const env: Env = { now: () => Date.UTC(2026, 10, 1), newId: () => `d${++counter}` }
  const io = createMemoryProjectIO()
  const project = await createProject(io, { title: tx.title, author: tx.author, language: lang }, env)
  const m = project.manifest

  // Defaults (calendar, categories, types, kinds) are seeded the same way the app does on open.
  await ensureDefaults(project, env)
  await seedRuleCategories(project, env)
  await seedCodexTypes(project, env)
  await seedRelationTypes(project, env)
  await seedStateKinds(project, env)
  const [catMagic, catPhysics, catSociety] = m.ruleCategories
  const [typeCharacter, typeItem, typePlace] = m.codexTypes
  const relType = (i: number) => m.relationTypes[i].id
  const kindId = (i: number) => m.stateKinds[i].id // Location, Owner, Status, Title

  // Manuscript: drop the starter scene, then four chapters.
  await io.remove(m.manuscript[0].children[0].path as string)
  m.manuscript = tx.chapters.map((title, ci) => ({
    id: `ch${ci + 1}`,
    type: 'chapter' as const,
    title,
    children: SCENES.filter((s) => s.chapter === ci).map((s) => ({
      id: s.key,
      type: 'scene' as const,
      title: tx.scenes[s.key].title,
      path: `manuscript/${s.key}.json`,
      children: [],
    })),
  }))

  // Timeline: a branch after the fog, undated node, one deliberate date-order mistake (n3a).
  const date = (day: number, month = 10) => ({ year: 1887, month, day })
  const node = (id: string, x: number, y: number, p: Partial<TimelineNode>): TimelineNode => ({
    id,
    title: tx.nodes[id].title,
    description: doc(tx.nodes[id].note),
    date: null,
    color: null,
    tag: null,
    branchId: null,
    pos: { x, y },
    codexIds: [],
    ruleIds: [],
    ...p,
  })
  const timeline = timelineSchema.parse({
    version: TIMELINE_VERSION,
    id: TL,
    name: m.timelines[0].title,
    view: 'flow',
    branches: [
      { id: 'br-tobias', name: tx.branches.tobias, color: '#2f6fb3', dashed: false },
      { id: 'br-mara', name: tx.branches.mara, color: '#b3562f', dashed: true },
    ],
    nodes: [
      node('n1', 0, 120, { date: date(28, 9), codexIds: ['mara', 'lighthouse'] }),
      node('n2', 260, 120, { date: date(3), codexIds: ['mara'], ruleIds: ['r2', 'r3'] }),
      node('n3a', 520, 20, { date: date(2), branchId: 'br-tobias', codexIds: ['tobias'] }),
      node('n3b', 520, 220, { branchId: 'br-mara', codexIds: ['mara', 'lantern'], ruleIds: ['r1'] }),
      node('n4', 780, 120, { date: date(4), codexIds: ['mara', 'tobias'] }),
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n2', to: 'n3a' },
      { id: 'e3', from: 'n2', to: 'n3b' },
      { id: 'e4', from: 'n3a', to: 'n4' },
      { id: 'e5', from: 'n3b', to: 'n4' },
    ],
  })
  // ensureDefaults listed the starter timeline under a generated id; move it to the fixed id.
  await io.remove(m.timelines[0].path)
  m.timelines = [{ id: TL, path: `timelines/${TL}.json`, title: m.timelines[0].title }]
  await project.saveItem(m.timelines[0].path, timelineSchema, timeline)

  // Rules.
  const ruleCat: Record<string, string> = { r1: catMagic.id, r2: catSociety.id, r3: catPhysics.id }
  m.rules = []
  for (const id of ['r1', 'r2', 'r3']) {
    const r = tx.rules[id]
    const path = rulePath(id)
    await project.saveItem(path, ruleSchema, {
      version: RULE_VERSION,
      id,
      title: r.title,
      categoryId: ruleCat[id],
      description: doc(r.description),
      tags: r.tags,
      exceptions: doc(r.exceptions),
    })
    m.rules.push({ id, path, title: r.title })
  }

  // Codex entries, with two dated states and rule links.
  const here = (nodeId: string) => nodeRef(nodeId)
  const entryDefs = [
    { id: 'mara', typeId: typeCharacter.id, ruleIds: ['r2'], states: [
      { id: 'st-mara-loc', kindId: kindId(0), value: 'lighthouse', from: here('n1') },
    ] },
    { id: 'tobias', typeId: typeCharacter.id, ruleIds: [], states: [
      { id: 'st-tobias-status', kindId: kindId(2), value: tx.tobiasStatus, from: here('n3a'), until: here('n4') },
    ] },
    { id: 'lighthouse', typeId: typePlace.id, ruleIds: [], states: [] },
    { id: 'lantern', typeId: typeItem.id, ruleIds: ['r1'], states: [
      { id: 'st-lantern-owner', kindId: kindId(1), value: 'mara', from: here('n1') },
    ] },
  ]
  m.codexEntries = []
  for (const e of entryDefs) {
    const t = tx.entries[e.id]
    const path = codexEntryPath(e.id)
    await project.saveItem(path, codexEntrySchema, {
      version: CODEX_ENTRY_VERSION,
      id: e.id,
      typeId: e.typeId,
      name: t.name,
      aliases: t.aliases,
      image: null,
      notes: doc(t.notes),
      tags: [],
      ruleIds: e.ruleIds,
      appendixText: t.appendix,
      includeInAppendices: true,
      states: e.states.map((s) => ({ until: null, final: false, ...s })),
    })
    m.codexEntries.push({ id: e.id, path, title: t.name })
  }

  // Relationships.
  const rels = [
    { id: 'rel-siblings', fromId: 'mara', toId: 'tobias', typeId: relType(3) },
    { id: 'rel-located', fromId: 'mara', toId: 'lighthouse', typeId: relType(5) },
    { id: 'rel-owns', fromId: 'mara', toId: 'lantern', typeId: relType(6) },
  ]
  m.relationships = []
  for (const r of rels) {
    const path = relationshipPath(r.id)
    await project.saveItem(path, relationshipSchema, {
      version: RELATIONSHIP_VERSION,
      ...r,
      note: doc(),
      nodeRef: null,
    })
    m.relationships.push({ id: r.id, path })
  }

  // Knowledge: Mara learns what the lantern burns (told in s2), and acts on it in s6.
  await project.saveItem(knowledgePath('k1'), knowledgeItemSchema, {
    version: KNOWLEDGE_VERSION,
    id: 'k1',
    title: tx.knowledge.title,
    description: doc(tx.knowledge.description),
    tags: [],
    about: { type: 'rule', id: 'r1' },
    learnings: [
      {
        id: 'k1-mara',
        entryId: 'mara',
        at: nodeRef('n1'),
        note: tx.knowledge.note,
        forgottenAt: null,
        revealedIn: { sceneId: 's2', blockId: blockId('s2', 1) },
      },
    ],
  })
  m.knowledge = [{ id: 'k1', path: knowledgePath('k1'), title: tx.knowledge.title }]

  // Scenes with block ids and links.
  for (const s of SCENES) {
    const t = tx.scenes[s.key]
    const eventBlock = blockId(s.key, EVENT_PARA[s.key] ?? 0)
    const links: Link[] = [
      { id: `${s.key}-ev`, kind: EVENT_KIND, from: { item: s.key, block: eventBlock }, to: { item: TL, block: s.node } },
      ...s.codex.map(([p, entry]) => ({
        id: `${s.key}-cx-${entry}`,
        kind: CODEX_KIND,
        from: { item: s.key, block: blockId(s.key, p) },
        to: { item: entry },
      })),
    ]
    if (s.key === 's6')
      links.push({
        id: 's6-kn',
        kind: KNOWLEDGE_KIND,
        from: { item: 's6', block: eventBlock },
        to: { item: 'k1', entry: 'mara' },
      })
    const content = {
      type: 'doc',
      content: t.paras.map((text, i) => ({
        type: 'paragraph',
        attrs: { id: blockId(s.key, i) },
        content: [{ type: 'text', text }],
      })),
    }
    await project.saveItem(`manuscript/${s.key}.json`, sceneSchema, {
      version: SCENE_VERSION,
      id: s.key,
      title: t.title,
      status: s.status,
      synopsis: t.synopsis,
      povId: 'mara',
      wordCount: countWords(content),
      content,
      todos: [],
      comments: [],
      links,
    })
  }

  await project.saveManifest()
  // Sanity: what we built must open cleanly.
  const opened = await openProject(io, env)
  if (opened.status !== 'ok' || opened.issues.length > 0)
    throw new Error(`Sample ${lang} does not open cleanly: ${JSON.stringify(opened)}`)
  const out: Record<string, string> = {}
  for (const [path, text] of [...io.files].sort(([a], [b]) => (a < b ? -1 : 1))) out[path] = text
  return out
}
