import { countWords } from '../../editor/wordCount'
import { createMemoryProjectIO } from '../../project/io/memory'
import { createProject, openProject } from '../../project/open'
import { ensureDefaults } from '../../project/timelines'
import { codexEntryPath, seedCodexTypes } from '../../project/codex'
import { seedRelationTypes, relationshipPath } from '../../project/relations'
import { seedRuleCategories } from '../../project/rules'
import { seedStateKinds } from '../../project/states'
import { CODEX_KIND, EVENT_KIND, type Link } from '../../project/links'
import { CODEX_ENTRY_VERSION, codexEntrySchema } from '../../project/schemas/codexEntry'
import { RELATIONSHIP_VERSION, relationshipSchema } from '../../project/schemas/relationship'
import { SCENE_VERSION, sceneSchema } from '../../project/schemas/scene'
import { timelineSchema, TIMELINE_VERSION, type TimelineNode } from '../../timeline/schema'
import type { Env } from '../../project/types'
import type { SampleLang } from '../text'
import { SCREENPLAY_TEXT } from './text'

export const screenplaySampleDir = (lang: SampleLang) => `screenplay-${lang}`

type Doc = Record<string, unknown>
const doc = (...paras: string[]): Doc => ({
  type: 'doc',
  content: paras.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
})

const TL = 'tl-main'
const SEQUENCES = [
  { id: 'q1', scenes: ['s1', 's2', 's3'] },
  { id: 'q2', scenes: ['s4', 's5', 's6'] },
]
/** Element index (in the scene) that carries the timeline link. */
const EVENT: Record<string, { node: 'n1' | 'n2'; el: number }> = {
  s1: { node: 'n1', el: 1 },
  s2: { node: 'n1', el: 1 },
  s3: { node: 'n1', el: 1 },
  s4: { node: 'n2', el: 1 },
  s5: { node: 'n2', el: 1 },
  s6: { node: 'n2', el: 1 },
}
const COMMENT_SCENE = 's3'
const COMMENT_ID = 'c1'
const blockId = (scene: string, i: number) => `${scene}-e${i}`

/** Builds the sample screenplay for one language as `path -> file text`, with fixed ids and dates. */
export async function buildScreenplaySample(lang: SampleLang): Promise<Record<string, string>> {
  const tx = SCREENPLAY_TEXT[lang]
  let counter = 0
  const env: Env = { now: () => Date.UTC(2026, 10, 1), newId: () => `d${++counter}` }
  const io = createMemoryProjectIO()
  const project = await createProject(io, { title: tx.title, author: tx.author, language: lang, kind: 'screenplay' }, env)
  const m = project.manifest
  m.titlePage = { contact: tx.contact, date: tx.date }

  await ensureDefaults(project, env)
  await seedRuleCategories(project, env)
  await seedCodexTypes(project, env)
  await seedRelationTypes(project, env)
  await seedStateKinds(project, env)
  const [typeCharacter, , typePlace] = m.codexTypes
  const relType = (i: number) => m.relationTypes[i].id

  // Manuscript: drop the starter scene, then two sequences of three scenes.
  await io.remove(m.manuscript[0].children[0].path as string)
  m.manuscript = SEQUENCES.map((q, qi) => ({
    id: q.id,
    type: 'chapter' as const,
    title: tx.sequences[qi],
    children: q.scenes.map((key) => ({
      id: key,
      type: 'scene' as const,
      title: tx.scenes[key].title,
      path: `manuscript/${key}.json`,
      children: [],
    })),
  }))

  // Timeline: two dated events with one deliberate date-order mistake (n2 is dated before n1).
  const node = (id: 'n1' | 'n2', x: number, day: number, codexIds: string[]): TimelineNode => ({
    id,
    title: tx.nodes[id].title,
    description: doc(tx.nodes[id].note),
    date: { year: 2026, month: 10, day },
    color: null,
    tag: null,
    branchId: null,
    pos: { x, y: 120 },
    codexIds,
    ruleIds: [],
  })
  const timeline = timelineSchema.parse({
    version: TIMELINE_VERSION,
    id: TL,
    name: m.timelines[0].title,
    view: 'flow',
    branches: [],
    nodes: [node('n1', 0, 14, ['anna', 'marek', 'stop']), node('n2', 260, 13, ['anna', 'driver'])],
    edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
  })
  await io.remove(m.timelines[0].path)
  m.timelines = [{ id: TL, path: `timelines/${TL}.json`, title: m.timelines[0].title }]
  await project.saveItem(m.timelines[0].path, timelineSchema, timeline)

  // Codex: three characters and one place.
  const entryDefs = [
    { id: 'anna', typeId: typeCharacter.id },
    { id: 'marek', typeId: typeCharacter.id },
    { id: 'driver', typeId: typeCharacter.id },
    { id: 'stop', typeId: typePlace.id },
  ] as const
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
      ruleIds: [],
      appendixText: t.appendix,
      includeInAppendices: true,
      states: [],
    })
    m.codexEntries.push({ id: e.id, path, title: t.name })
  }

  const rels = [
    { id: 'rel-siblings', fromId: 'anna', toId: 'marek', typeId: relType(3) },
    { id: 'rel-located', fromId: 'anna', toId: 'stop', typeId: relType(5) },
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

  // Cues and place headings link to codex entries by name or alias.
  const byName = new Map<string, string>()
  for (const e of entryDefs) {
    const t = tx.entries[e.id]
    for (const n of [t.name, ...t.aliases]) byName.set(n.toUpperCase(), e.id)
  }
  const placeName = tx.entries.stop.name.toUpperCase()

  for (const key of SEQUENCES.flatMap((q) => q.scenes)) {
    const t = tx.scenes[key]
    const links: Link[] = []
    const comments: { id: string; text: string; createdAt: string; resolved: boolean }[] = []
    const content = {
      type: 'doc',
      content: t.els.map(([type, text], i) => {
        const id = blockId(key, i)
        const entry = type === 'character' ? byName.get(text) : type === 'sceneHeading' && text.includes(placeName) ? 'stop' : undefined
        if (entry) links.push({ id: `${key}-cx-${i}`, kind: CODEX_KIND, from: { item: key, block: id }, to: { item: entry } })
        const ev = EVENT[key]
        if (ev && ev.el === i)
          links.push({ id: `${key}-ev`, kind: EVENT_KIND, from: { item: key, block: id }, to: { item: TL, block: ev.node } })
        const commented = key === COMMENT_SCENE && text.startsWith(tx.comment.on)
        if (commented) comments.push({ id: COMMENT_ID, text: tx.comment.text, createdAt: new Date(env.now()).toISOString(), resolved: false })
        return {
          type,
          attrs: { id },
          content: [{ type: 'text', text, ...(commented ? { marks: [{ type: 'comment', attrs: { commentId: COMMENT_ID } }] } : {}) }],
        }
      }),
    }
    await project.saveItem(`manuscript/${key}.json`, sceneSchema, {
      version: SCENE_VERSION,
      id: key,
      title: t.title,
      status: 'draft',
      synopsis: t.synopsis,
      wordCount: countWords(content),
      content,
      todos: [],
      comments,
      links,
    })
  }

  await project.saveManifest()
  const opened = await openProject(io, env)
  if (opened.status !== 'ok' || opened.issues.length > 0)
    throw new Error(`Sample screenplay ${lang} does not open cleanly: ${JSON.stringify(opened)}`)
  const out: Record<string, string> = {}
  for (const [path, text] of [...io.files].sort(([a], [b]) => (a < b ? -1 : 1))) out[path] = text
  return out
}
