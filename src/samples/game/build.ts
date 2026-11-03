import { countWords } from '../../editor/wordCount'
import { formatLineId } from '../../editor/game/lineIds'
import { createMemoryProjectIO } from '../../project/io/memory'
import { createProject, openProject } from '../../project/open'
import { ensureDefaults } from '../../project/timelines'
import { codexEntryPath, seedCodexTypes } from '../../project/codex'
import { defaultNames } from '../../project/defaultNames'
import { mechanicPath, seedGameDocument } from '../../project/gamedoc'
import { seedRelationTypes, relationshipPath } from '../../project/relations'
import { seedRuleCategories } from '../../project/rules'
import { seedStateKinds } from '../../project/states'
import { EVENT_KIND, type Link } from '../../project/links'
import type { ManuscriptNode } from '../../project/schemas/manifest'
import { CODEX_ENTRY_VERSION, codexEntrySchema } from '../../project/schemas/codexEntry'
import { CONVERSATION_VERSION, conversationSchema } from '../../project/schemas/conversation'
import { GAME_OVERVIEW_FILE, GAME_OVERVIEW_VERSION, gameOverviewSchema } from '../../project/schemas/gameOverview'
import { GLOSSARY_FILE, GLOSSARY_VERSION, glossarySchema } from '../../project/schemas/glossary'
import { MECHANIC_VERSION, mechanicSchema, type MechanicLink, type MechanicStatus } from '../../project/schemas/mechanic'
import { RELATIONSHIP_VERSION, relationshipSchema } from '../../project/schemas/relationship'
import { SCENE_VERSION, sceneSchema } from '../../project/schemas/scene'
import { STORY_MAP_FILE, STORY_MAP_VERSION, storyMapSchema } from '../../project/schemas/storyMap'
import { VARIABLES_FILE, VARIABLES_VERSION, variablesSchema } from '../../project/schemas/variables'
import { timelineSchema, TIMELINE_VERSION, type TimelineNode } from '../../timeline/schema'
import type { Env } from '../../project/types'
import { SAMPLE_INDEX } from '../build'
import type { SampleLang } from '../text'
import { GAME_SAMPLE_TEXT, type L } from './text'

export { SAMPLE_INDEX }
export const gameSampleDir = (lang: SampleLang) => `game-${lang}`

type Doc = Record<string, unknown>
const textNode = (text: string) => ({ type: 'text', text })
const para = (text: string) => ({ type: 'paragraph', content: [textNode(text)] })
const doc = (...paras: string[]): Doc => ({ type: 'doc', content: paras.map(para) })

const TL = 'tl-main'
const SNEAK = { timelineId: TL, branchId: 'br-sneak' }
const entryId = (key: string) => `e-${key}`

/** Builds the sample game for one language as `path -> file text`, with fixed ids and dates. */
export async function buildGameSample(lang: SampleLang): Promise<Record<string, string>> {
  const tx = GAME_SAMPLE_TEXT[lang]
  let counter = 0
  const env: Env = { now: () => Date.UTC(2026, 10, 1), newId: () => `d${++counter}` }
  const io = createMemoryProjectIO()
  const project = await createProject(io, { title: tx.title, author: tx.author, language: lang, kind: 'game' }, env)
  const m = project.manifest

  // Defaults are seeded the way the app does on open.
  await ensureDefaults(project, env)
  await seedRuleCategories(project, env)
  await seedGameDocument(project, env)
  await seedCodexTypes(project, env)
  await seedRelationTypes(project, env)
  await seedStateKinds(project, env)
  const [typeCharacter, typeItem, typePlace] = m.codexTypes
  const category = (i: number) => m.mechanicCategories[i].id

  // Line blocks: one global counter keeps line ids and block ids unique across the project.
  let lines = 0
  const line = ([who, text]: L) => {
    lines++
    return {
      type: 'line',
      attrs: {
        id: `b${lines}`,
        lineId: formatLineId(lines),
        speakerId: who ? entryId(who) : null,
        speakerName: null,
        kind: who ? 'speech' : 'text',
      },
      content: [textNode(text)],
    }
  }
  const lineDoc = (ls: readonly L[]) => ({ type: 'doc', content: ls.map(line) })

  // Variables.
  const V = { key: 'v-key', coins: 'v-coins', trust: 'v-trust' }
  await project.saveItem(VARIABLES_FILE, variablesSchema, {
    version: VARIABLES_VERSION,
    variables: [
      { id: V.key, name: tx.variables.key, type: 'flag', default: false },
      { id: V.coins, name: tx.variables.coins, type: 'number', default: 5 },
      { id: V.trust, name: tx.variables.trust, type: 'number', default: 0 },
    ],
  })
  m.variables = { id: 'variables', path: VARIABLES_FILE }

  // Timeline: one branch (the sneak route), three undated events.
  const node = (id: string, x: number, y: number, p: Partial<TimelineNode>): TimelineNode => ({
    id,
    title: tx.nodes[id as 'n1'].title,
    description: doc(tx.nodes[id as 'n1'].note),
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
    branches: [{ id: SNEAK.branchId, name: tx.branch, color: '#b3562f', dashed: true }],
    nodes: [
      node('n1', 0, 120, { codexIds: [entryId('wren')] }),
      node('n2', 520, 120, { codexIds: [entryId('ida'), entryId('tower')] }),
      node('n3', 260, 260, { branchId: SNEAK.branchId, codexIds: [entryId('wren')] }),
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n1', to: 'n3' },
      { id: 'e3', from: 'n3', to: 'n2' },
    ],
  })
  await io.remove(m.timelines[0].path)
  m.timelines = [{ id: TL, path: `timelines/${TL}.json`, title: m.timelines[0].title }]
  await project.saveItem(m.timelines[0].path, timelineSchema, timeline)

  // Codex: three characters, a place and an item, joined by relationships.
  const entryDefs = [
    { key: 'wren', typeId: typeCharacter.id },
    { key: 'ida', typeId: typeCharacter.id },
    { key: 'bram', typeId: typeCharacter.id },
    { key: 'tower', typeId: typePlace.id },
    { key: 'key', typeId: typeItem.id },
  ] as const
  m.codexEntries = []
  for (const e of entryDefs) {
    const t = tx.entries[e.key]
    const id = entryId(e.key)
    const path = codexEntryPath(id)
    await project.saveItem(path, codexEntrySchema, {
      version: CODEX_ENTRY_VERSION,
      id,
      typeId: e.typeId,
      name: t.name,
      aliases: t.aliases,
      image: null,
      notes: doc(t.notes),
      tags: [],
      ruleIds: [],
      appendixText: '',
      includeInAppendices: false,
      states: [],
    })
    m.codexEntries.push({ id, path, title: t.name })
  }
  const relType = (i: number) => m.relationTypes[i].id // Friend, ..., Located in, Owns
  const rels = [
    { id: 'rel-friends', fromId: entryId('wren'), toId: entryId('ida'), typeId: relType(0) },
    { id: 'rel-ida-tower', fromId: entryId('ida'), toId: entryId('tower'), typeId: relType(5) },
    { id: 'rel-bram-key', fromId: entryId('bram'), toId: entryId('key'), typeId: relType(6) },
  ]
  m.relationships = []
  for (const r of rels) {
    const path = relationshipPath(r.id)
    await project.saveItem(path, relationshipSchema, { version: RELATIONSHIP_VERSION, ...r, note: doc(), nodeRef: null })
    m.relationships.push({ id: r.id, path })
  }

  // Scripts: each first line is linked to a timeline event.
  const scripts = [
    { id: 'arrival', key: 'arrival', event: 'n1' },
    { id: 'alley', key: 'alley', event: 'n3' },
    { id: 'tower', key: 'tower', event: 'n2' },
  ] as const
  const scriptPath = (id: string) => `manuscript/${id}.json`
  for (const s of scripts) {
    const content = lineDoc(tx.scripts[s.key])
    const first = (content.content[0]!.attrs as { id: string }).id
    const links: Link[] = [
      { id: `${s.id}-ev`, kind: EVENT_KIND, from: { item: s.id, block: first }, to: { item: TL, block: s.event } },
    ]
    await project.saveItem(scriptPath(s.id), sceneSchema, {
      version: SCENE_VERSION,
      id: s.id,
      title: tx.items[s.key].title,
      status: 'draft',
      synopsis: tx.items[s.key].synopsis,
      wordCount: countWords(content),
      content,
      todos: [],
      comments: [],
      links,
    })
  }

  // Conversation: choices, one condition (pay needs a coin), variable changes, and one node nothing leads to.
  const cond = (variableId: string, op: 'gte' | 'isTrue', value?: number) => ({
    mode: 'all' as const,
    terms: [op === 'gte' ? { variableId, op, value: value! } : { variableId, op }],
  })
  const lines_ = (id: string, x: number, y: number, ls: readonly L[], next: string | null, sets: unknown[] = []) => ({
    id, type: 'lines' as const, x, y, sets, content: lineDoc(ls), next,
  })
  const conv = tx.conv
  const conversation = conversationSchema.parse({
    version: CONVERSATION_VERSION,
    id: 'gate-talk',
    title: tx.items.gate.title,
    status: 'draft',
    synopsis: tx.items.gate.synopsis,
    startNodeId: 'n-greet',
    nodes: [
      lines_('n-greet', 0, 120, conv.greet, 'n-ask'),
      {
        id: 'n-ask', type: 'choice', x: 340, y: 120, sets: [],
        options: [
          {
            id: 'o-pay', text: conv.askPay, target: 'n-pay', condition: cond(V.coins, 'gte', 1),
            sets: [{ variableId: V.coins, op: 'add', value: -1 }, { variableId: V.trust, op: 'add', value: 1 }],
          },
          { id: 'o-plead', text: conv.askPlead, target: 'n-plead', sets: [] },
          { id: 'o-leave', text: conv.askLeave, target: 'n-leave', sets: [] },
        ],
      },
      lines_('n-pay', 760, 0, conv.pay, 'n-end', [{ variableId: V.key, op: 'set', value: true }]),
      lines_('n-plead', 760, 200, conv.plead, 'n-ask'),
      lines_('n-leave', 760, 400, conv.leave, 'n-end'),
      { id: 'n-end', type: 'end', x: 1180, y: 200, sets: [] },
      lines_('n-old', 340, 460, conv.old, 'n-end'), // the deliberate finding: nothing leads here
    ],
  })
  await project.saveItem(scriptPath('gate-talk'), conversationSchema, conversation)

  // Tree: two folders; the alley carries the sneak route.
  const item = (id: string, type: 'scene' | 'conversation', title: string, routes?: (typeof SNEAK)[]): ManuscriptNode => ({
    id,
    type,
    title,
    path: scriptPath(id),
    ...(routes ? { routes } : {}),
    children: [],
  })
  m.manuscript = [
    {
      id: 'act1',
      type: 'chapter',
      title: tx.folders.act1,
      children: [
        item('arrival', 'scene', tx.items.arrival.title),
        item('gate-talk', 'conversation', tx.items.gate.title),
        item('alley', 'scene', tx.items.alley.title, [SNEAK]),
      ],
    },
    { id: 'act2', type: 'chapter', title: tx.folders.act2, children: [item('tower', 'scene', tx.items.tower.title)] },
  ]
  m.lineCounter = lines

  // Story map: unlock conditions on the arrows out of the gate.
  await project.saveItem(STORY_MAP_FILE, storyMapSchema, {
    version: STORY_MAP_VERSION,
    boxes: [
      { id: 'bx-arrival', kind: 'item', itemId: 'arrival', x: 0, y: 120, start: true },
      { id: 'bx-gate', kind: 'item', itemId: 'gate-talk', x: 320, y: 120, start: false },
      { id: 'bx-tower', kind: 'item', itemId: 'tower', x: 680, y: 0, start: false },
      { id: 'bx-alley', kind: 'item', itemId: 'alley', x: 680, y: 240, start: false },
      { id: 'bx-bell', kind: 'beat', text: tx.beat, x: 1000, y: 0, start: false },
    ],
    arrows: [
      { id: 'a-1', from: 'bx-arrival', to: 'bx-gate' },
      { id: 'a-2', from: 'bx-gate', to: 'bx-tower', condition: { mode: 'all', terms: [{ variableId: V.key, op: 'isTrue' }] } },
      { id: 'a-3', from: 'bx-gate', to: 'bx-alley', condition: { mode: 'all', terms: [{ variableId: V.key, op: 'isFalse' }] } },
      { id: 'a-4', from: 'bx-alley', to: 'bx-tower' },
      { id: 'a-5', from: 'bx-tower', to: 'bx-bell' },
    ],
  })
  m.storyMap = { id: 'story-map', path: STORY_MAP_FILE }

  // Game document: Overview under the seeded headings, five mechanics, a short glossary.
  const heading = (text: string) => ({ type: 'heading', attrs: { level: 2 }, content: [textNode(text)] })
  const bullets = (items: string[]) => ({
    type: 'bulletList',
    content: items.map((t) => ({ type: 'listItem', content: [para(t)] })),
  })
  const [hPitch, hPillars, hAudience, hLoop] = defaultNames(lang).overviewHeadings
  const ov = tx.overview
  await project.saveItem(GAME_OVERVIEW_FILE, gameOverviewSchema, {
    version: GAME_OVERVIEW_VERSION,
    content: {
      type: 'doc',
      content: [
        heading(hPitch), para(ov.pitch),
        heading(hPillars), bullets(ov.pillars),
        heading(hAudience), para(ov.audience),
        heading(hLoop), para(ov.loop),
      ],
    },
  })

  const mechanicDefs: { key: 'm1' | 'm2' | 'm3' | 'm4' | 'm5'; cat: number; status: MechanicStatus; links: MechanicLink[] }[] = [
    { key: 'm1', cat: 0, status: 'implemented', links: [
      { kind: 'item', id: 'gate-talk' }, { kind: 'variable', id: V.key }, { kind: 'entry', id: entryId('bram') },
    ] },
    { key: 'm2', cat: 2, status: 'designed', links: [
      { kind: 'variable', id: V.coins }, { kind: 'variable', id: V.trust }, { kind: 'mechanic', id: 'm1' },
    ] },
    { key: 'm3', cat: 4, status: 'idea', links: [{ kind: 'item', id: 'alley' }, { kind: 'entry', id: entryId('tower') }] },
    { key: 'm4', cat: 3, status: 'implemented', links: [
      { kind: 'beat', id: 'bx-bell' }, { kind: 'entry', id: entryId('key') }, { kind: 'item', id: 'tower' },
    ] },
    { key: 'm5', cat: 5, status: 'cut', links: [] },
  ]
  m.mechanics = []
  for (const d of mechanicDefs) {
    const t = tx.mechanics[d.key]
    const path = mechanicPath(d.key)
    await project.saveItem(path, mechanicSchema, {
      version: MECHANIC_VERSION,
      id: d.key,
      title: t.title,
      summary: t.summary,
      categoryId: category(d.cat),
      status: d.status,
      tags: t.tags,
      description: doc(t.description),
      parameters: t.params.map(([name, value], i) => ({ id: `${d.key}-p${i + 1}`, name, value })),
      links: d.links,
    })
    m.mechanics.push({ id: d.key, path, title: t.title })
  }

  await project.saveItem(GLOSSARY_FILE, glossarySchema, {
    version: GLOSSARY_VERSION,
    entries: tx.glossary.map(([term, definition], i) => ({ id: `g${i + 1}`, term, definition })),
  })
  m.glossary = { id: 'glossary', path: GLOSSARY_FILE, title: 'Glossary' }

  await project.saveManifest()
  // Sanity: what we built must open cleanly.
  const opened = await openProject(io, env)
  if (opened.status !== 'ok' || opened.issues.length > 0)
    throw new Error(`Game sample ${lang} does not open cleanly: ${JSON.stringify(opened)}`)
  const out: Record<string, string> = {}
  for (const [path, text] of [...io.files].sort(([a], [b]) => (a < b ? -1 : 1))) out[path] = text
  return out
}
