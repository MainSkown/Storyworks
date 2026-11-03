// Builds large screenplay and game projects through the real project writer (schemas + atomic saves into a memory folder).
// Used by scripts/perf-m11b.mjs (loaded through vite's ssrLoadModule). Same approach as perf-fixture.ts.
import { countWords } from '../src/editor/wordCount'
import { formatLineId } from '../src/editor/game/lineIds'
import { defaultNames } from '../src/project/defaultNames'
import { createMemoryProjectIO } from '../src/project/io/memory'
import { createProject, openProject } from '../src/project/open'
import { ensureDefaults } from '../src/project/timelines'
import { codexEntryPath, seedCodexTypes } from '../src/project/codex'
import { mechanicPath, seedGameDocument } from '../src/project/gamedoc'
import { seedRelationTypes } from '../src/project/relations'
import { seedRuleCategories } from '../src/project/rules'
import { seedStateKinds } from '../src/project/states'
import { CODEX_KIND, type Link } from '../src/project/links'
import type { ManuscriptNode } from '../src/project/schemas/manifest'
import { CODEX_ENTRY_VERSION, codexEntrySchema } from '../src/project/schemas/codexEntry'
import { CONVERSATION_VERSION, conversationSchema } from '../src/project/schemas/conversation'
import { GAME_OVERVIEW_FILE, GAME_OVERVIEW_VERSION, gameOverviewSchema } from '../src/project/schemas/gameOverview'
import { GLOSSARY_FILE, GLOSSARY_VERSION, glossarySchema } from '../src/project/schemas/glossary'
import {
  MECHANIC_STATUSES,
  MECHANIC_VERSION,
  mechanicSchema,
  type MechanicLink,
} from '../src/project/schemas/mechanic'
import { SCENE_VERSION, sceneSchema } from '../src/project/schemas/scene'
import { STORY_MAP_FILE, STORY_MAP_VERSION, storyMapSchema } from '../src/project/schemas/storyMap'
import { VARIABLES_FILE, VARIABLES_VERSION, variablesSchema } from '../src/project/schemas/variables'
import type { Env } from '../src/project/types'

let seed = 17
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!
const VOCAB =
  'the road ran beyond river stone light shadow window door night morning silence voice hand walked turned said knew never always small heavy cold bright slow quick after before under over between city gate market harbour lamp rain wind map letter bread salt thread'.split(
    ' ',
  )
const NAMES = 'ANNA MAREK IDA BRAM WREN SOREN KELLEN PETRA ORIN RHEA TALIA VERA'.split(' ')
const PLACES = 'KITCHEN ROOFTOP HARBOUR GATE MARKET TOWER CELLAR ALLEY STATION BRIDGE'.split(' ')

function words(n: number): string {
  const w = Array.from({ length: n }, () => pick(VOCAB))
  w[0] = w[0]![0]!.toUpperCase() + w[0]!.slice(1)
  return w.join(' ') + '.'
}
const textNode = (text: string) => ({ type: 'text', text })
const para = (text: string) => ({ type: 'paragraph', content: [textNode(text)] })
const doc = (...paras: string[]) => ({ type: 'doc', content: paras.map(para) })
const titleCase = (s: string) => s[0]!.toUpperCase() + s.slice(1).toLowerCase()

function makeEnv(): Env {
  let counter = 0
  return { now: () => Date.UTC(2026, 10, 1), newId: () => `d${++counter}` }
}

async function finish(io: ReturnType<typeof createMemoryProjectIO>, env: Env, what: string) {
  const opened = await openProject(io, env)
  if (opened.status !== 'ok' || opened.issues.length > 0)
    throw new Error(`${what} fixture does not open cleanly: ${JSON.stringify(opened)}`)
  const files: Record<string, string> = {}
  for (const [path, text] of io.files) files[path] = text
  return files
}

export interface ScreenplayFixture {
  files: Record<string, string>
  sceneIds: string[]
  scenePaths: string[]
  elements: number
  totalWords: number
}

/** ~120 pages: sequences of scenes (heading, action, dialogue exchanges), cues linked to codex entries. */
export async function buildScreenplayFixture(
  sequences = 12,
  scenesPer = 10,
  exchanges = 6,
): Promise<ScreenplayFixture> {
  seed = 17
  const env = makeEnv()
  const io = createMemoryProjectIO()
  const project = await createProject(
    io,
    { title: 'The Long Script', author: 'Perf Tester', language: 'en', kind: 'screenplay' },
    env,
  )
  const m = project.manifest
  await ensureDefaults(project, env)
  await seedRuleCategories(project, env)
  await seedCodexTypes(project, env)
  await seedRelationTypes(project, env)
  await seedStateKinds(project, env)
  const [typeCharacter] = m.codexTypes
  m.codexEntries = []
  for (const n of NAMES) {
    const id = `c-${n.toLowerCase()}`
    const path = codexEntryPath(id)
    await project.saveItem(path, codexEntrySchema, {
      version: CODEX_ENTRY_VERSION,
      id,
      typeId: typeCharacter.id,
      name: titleCase(n),
      aliases: [],
      image: null,
      notes: doc(words(20)),
      tags: [],
      ruleIds: [],
      appendixText: '',
      includeInAppendices: true,
      states: [],
    })
    m.codexEntries.push({ id, path, title: titleCase(n) })
  }

  await io.remove(m.manuscript[0]!.children[0]!.path as string)
  const sceneIds: string[] = []
  const scenePaths: string[] = []
  let elements = 0
  let totalWords = 0
  m.manuscript = []
  for (let q = 0; q < sequences; q++) {
    const kids: ManuscriptNode[] = []
    for (let s = 0; s < scenesPer; s++) {
      const id = `s${q}-${s}`
      const path = `manuscript/${id}.json`
      const links: Link[] = []
      const els: [string, string][] = [
        ['sceneHeading', `${pick(['INT.', 'EXT.'])} ${pick(PLACES)} - ${pick(['DAY', 'NIGHT', 'DUSK'])}`],
        ['action', words(34)],
        ['action', words(28)],
      ]
      for (let e = 0; e < exchanges; e++) {
        els.push(['character', pick(NAMES)])
        if (rnd() < 0.2) els.push(['parenthetical', `(${pick(VOCAB)} ${pick(VOCAB)})`])
        els.push(['dialogue', words(22)])
      }
      if (s === scenesPer - 1) els.push(['transition', 'CUT TO:'])
      const content = {
        type: 'doc',
        content: els.map(([type, text], i) => {
          const bid = `${id}-e${i}`
          if (type === 'character')
            links.push({
              id: `${id}-cx-${i}`,
              kind: CODEX_KIND,
              from: { item: id, block: bid },
              to: { item: `c-${text.toLowerCase()}` },
            })
          return { type, attrs: { id: bid }, content: [textNode(text)] }
        }),
      }
      elements += els.length
      const wc = countWords(content)
      totalWords += wc
      await project.saveItem(path, sceneSchema, {
        version: SCENE_VERSION,
        id,
        title: `Scene ${q * scenesPer + s + 1}`,
        status: 'draft',
        synopsis: words(8),
        wordCount: wc,
        content,
        todos: [],
        comments: [],
        links,
      })
      sceneIds.push(id)
      scenePaths.push(path)
      kids.push({ id, type: 'scene', title: `Scene ${q * scenesPer + s + 1}`, path, children: [] })
    }
    m.manuscript.push({ id: `q${q}`, type: 'chapter', title: `Sequence ${q + 1}`, children: kids })
  }
  await project.saveManifest()
  const files = await finish(io, env, 'Screenplay')
  return { files, sceneIds, scenePaths, elements, totalWords }
}

export interface GameFixtureSize {
  folders: number
  scriptsPer: number
  linesPer: number
  convGroups: number
  mechanics: number
  linksPer: number
  glossary: number
  entries: number
}
export const GAME_SIZE: GameFixtureSize = {
  folders: 10,
  scriptsPer: 10, // 99 scripts + 1 conversation = 100 story-map items
  linesPer: 35,
  convGroups: 75, // 4 nodes a group + end = 301 nodes
  mechanics: 300,
  linksPer: 5,
  glossary: 500,
  entries: 50,
}

export interface GameFixture {
  files: Record<string, string>
  itemIds: string[]
  convId: string
  convNodes: number
  lines: number
  mechanicIds: string[]
  variableIds: string[]
  entryIds: string[]
}

export async function buildGameFixture(size: GameFixtureSize = GAME_SIZE): Promise<GameFixture> {
  seed = 17
  const env = makeEnv()
  const io = createMemoryProjectIO()
  const project = await createProject(
    io,
    { title: 'The Long Game', author: 'Perf Tester', language: 'en', kind: 'game' },
    env,
  )
  const m = project.manifest
  await ensureDefaults(project, env)
  await seedRuleCategories(project, env)
  await seedGameDocument(project, env)
  await seedCodexTypes(project, env)
  await seedRelationTypes(project, env)
  await seedStateKinds(project, env)
  const [typeCharacter] = m.codexTypes

  // Codex entries (speakers).
  m.codexEntries = []
  const entryIds = Array.from({ length: size.entries }, (_, i) => `e${i}`)
  for (const id of entryIds) {
    const path = codexEntryPath(id)
    const name = `${titleCase(NAMES[Number(id.slice(1)) % NAMES.length]!)} ${id}`
    await project.saveItem(path, codexEntrySchema, {
      version: CODEX_ENTRY_VERSION,
      id,
      typeId: typeCharacter.id,
      name,
      aliases: [],
      image: null,
      notes: doc(words(15)),
      tags: [],
      ruleIds: [],
      appendixText: '',
      includeInAppendices: false,
      states: [],
    })
    m.codexEntries.push({ id, path, title: name })
  }

  // Variables: 10 (flags and numbers).
  const variableIds = Array.from({ length: 10 }, (_, i) => `v${i}`)
  await project.saveItem(VARIABLES_FILE, variablesSchema, {
    version: VARIABLES_VERSION,
    variables: variableIds.map((id, i) =>
      i % 2 === 0
        ? { id, name: `flag${i}`, type: 'flag' as const, default: false }
        : { id, name: `count${i}`, type: 'number' as const, default: 3 },
    ),
  })
  m.variables = { id: 'variables', path: VARIABLES_FILE }

  // Script lines: one global counter keeps line ids and block ids unique across the project.
  let lines = 0
  const line = () => {
    lines++
    const speaker = rnd() < 0.8 ? pick(entryIds) : null
    return {
      type: 'line',
      attrs: {
        id: `b${lines}`,
        lineId: formatLineId(lines),
        speakerId: speaker,
        speakerName: null,
        kind: speaker ? 'speech' : 'text',
      },
      content: [textNode(words(12))],
    }
  }
  const lineDoc = (n: number) => ({ type: 'doc', content: Array.from({ length: n }, line) })

  const scriptPath = (id: string) => `manuscript/${id}.json`
  const itemIds: string[] = []
  const folders: ManuscriptNode[] = []
  for (let f = 0; f < size.folders; f++) {
    const kids: ManuscriptNode[] = []
    for (let s = 0; s < size.scriptsPer; s++) {
      if (f === 0 && s === 0) continue // the conversation takes this slot below
      const id = `sc${f}-${s}`
      const content = lineDoc(size.linesPer)
      await project.saveItem(scriptPath(id), sceneSchema, {
        version: SCENE_VERSION,
        id,
        title: `Script ${f}.${s}`,
        status: 'draft',
        synopsis: words(8),
        wordCount: countWords(content),
        content,
        todos: [],
        comments: [],
        links: [],
      })
      itemIds.push(id)
      kids.push({ id, type: 'scene', title: `Script ${f}.${s}`, path: scriptPath(id), children: [] })
    }
    folders.push({ id: `fo${f}`, type: 'chapter', title: `Act ${f + 1}`, children: kids })
  }

  // One long conversation: groups of lines -> choice -> two answers (A needs a count) -> next group.
  const convId = 'long-talk'
  const cnodes: Record<string, unknown>[] = []
  const countVars = variableIds.filter((_, i) => i % 2 === 1)
  const flagVars = variableIds.filter((_, i) => i % 2 === 0)
  const linesNode = (id: string, y: number, next: string | null, sets: unknown[] = []) => ({
    id,
    type: 'lines',
    x: Number(id.split('-')[1]) * 340 + (id.startsWith('a') || id.startsWith('b') ? 400 : 0),
    y,
    sets,
    content: lineDoc(6),
    next,
  })
  for (let g = 0; g < size.convGroups; g++) {
    const next = g === size.convGroups - 1 ? 'end' : `l-${g + 1}`
    const cv = countVars[g % countVars.length]!
    const fv = flagVars[g % flagVars.length]!
    cnodes.push(linesNode(`l-${g}`, 0, `c-${g}`))
    cnodes.push({
      id: `c-${g}`,
      type: 'choice',
      x: g * 340 + 200,
      y: 0,
      sets: [],
      options: [
        {
          id: `oa-${g}`,
          text: words(4),
          target: `a-${g}`,
          condition: { mode: 'all', terms: [{ variableId: cv, op: 'gte', value: 1 }] },
          sets: [{ variableId: cv, op: 'add', value: -1 }],
        },
        { id: `ob-${g}`, text: words(4), target: `b-${g}`, sets: [] },
        { id: `oc-${g}`, text: words(4), target: `l-${g}`, sets: [] },
      ],
    })
    cnodes.push(linesNode(`a-${g}`, -150, next, [{ variableId: fv, op: 'set', value: true }]))
    cnodes.push(linesNode(`b-${g}`, 150, next, [{ variableId: cv, op: 'add', value: 1 }]))
  }
  cnodes.push({ id: 'end', type: 'end', x: size.convGroups * 340, y: 0, sets: [] })
  await project.saveItem(
    scriptPath(convId),
    conversationSchema,
    conversationSchema.parse({
      version: CONVERSATION_VERSION,
      id: convId,
      title: 'The long talk',
      status: 'draft',
      synopsis: '',
      startNodeId: 'l-0',
      nodes: cnodes,
    }),
  )
  itemIds.unshift(convId)
  folders[0]!.children.unshift({
    id: convId,
    type: 'conversation',
    title: 'The long talk',
    path: scriptPath(convId),
    children: [],
  })
  m.manuscript = folders
  m.lineCounter = lines

  // Story map: every item boxed in a grid, a chain of arrows, a beat every tenth, some conditions.
  const beatIds: string[] = []
  const boxes: unknown[] = []
  const arrows: unknown[] = []
  itemIds.forEach((id, i) => {
    boxes.push({ id: `bx-${id}`, kind: 'item', itemId: id, x: (i % 10) * 300, y: Math.floor(i / 10) * 200, start: i === 0 })
    if (i > 0)
      arrows.push({
        id: `a-${i}`,
        from: `bx-${itemIds[i - 1]}`,
        to: `bx-${id}`,
        ...(i % 7 === 0 ? { condition: { mode: 'all', terms: [{ variableId: flagVars[i % 5]!, op: 'isTrue' }] } } : {}),
      })
    if (i % 5 === 0) {
      const bid = `beat-${i}`
      beatIds.push(bid)
      boxes.push({ id: bid, kind: 'beat', text: words(5), x: (i % 10) * 300 + 150, y: Math.floor(i / 10) * 200 + 90, start: false })
      arrows.push({ id: `ab-${i}`, from: `bx-${id}`, to: bid })
    }
  })
  await project.saveItem(STORY_MAP_FILE, storyMapSchema, { version: STORY_MAP_VERSION, boxes, arrows })
  m.storyMap = { id: 'story-map', path: STORY_MAP_FILE }

  // Game document.
  const heading = (text: string) => ({ type: 'heading', attrs: { level: 2 }, content: [textNode(text)] })
  const names = defaultNames('en').overviewHeadings
  await project.saveItem(GAME_OVERVIEW_FILE, gameOverviewSchema, {
    version: GAME_OVERVIEW_VERSION,
    content: { type: 'doc', content: names.flatMap((h) => [heading(h), para(words(40))]) },
  })
  const mechanicIds = Array.from({ length: size.mechanics }, (_, i) => `m${i}`)
  const TAGS = Array.from({ length: 20 }, (_, i) => `tag${i}`)
  m.mechanics = []
  for (let i = 0; i < size.mechanics; i++) {
    const id = mechanicIds[i]!
    const links: MechanicLink[] = []
    const seen = new Set<string>()
    const add = (l: MechanicLink) => {
      const k = `${l.kind}:${l.id}`
      if (seen.has(k) || (l.kind === 'mechanic' && l.id === id)) return
      seen.add(k)
      links.push(l)
    }
    while (links.length < size.linksPer) {
      const r = rnd()
      if (r < 0.2) add({ kind: 'variable', id: pick(variableIds) })
      else if (r < 0.55) add({ kind: 'item', id: pick(itemIds) })
      else if (r < 0.65) add({ kind: 'beat', id: pick(beatIds) })
      else if (r < 0.8) add({ kind: 'entry', id: pick(entryIds) })
      else add({ kind: 'mechanic', id: pick(mechanicIds) })
    }
    if (i % 25 === 0) links[0] = { kind: 'item', id: `gone-${i}` } // a dangling link now and then
    const title = `Mechanic ${i} ${pick(VOCAB)}`
    const path = mechanicPath(id)
    await project.saveItem(path, mechanicSchema, {
      version: MECHANIC_VERSION,
      id,
      title,
      summary: words(10),
      categoryId: m.mechanicCategories[i % m.mechanicCategories.length]!.id,
      status: MECHANIC_STATUSES[i % MECHANIC_STATUSES.length]!,
      tags: [TAGS[i % 20]!, TAGS[(i * 7 + 3) % 20]!],
      description: doc(words(40), words(30)),
      parameters: Array.from({ length: 4 }, (_, p) => ({ id: `${id}-p${p}`, name: `param${p}`, value: String(i + p) })),
      links,
    })
    m.mechanics.push({ id, path, title })
  }
  await project.saveItem(GLOSSARY_FILE, glossarySchema, {
    version: GLOSSARY_VERSION,
    entries: Array.from({ length: size.glossary }, (_, i) => ({
      id: `g${i}`,
      term: `Term ${pick(VOCAB)} ${i}`,
      definition: words(20),
    })),
  })
  m.glossary = { id: 'glossary', path: GLOSSARY_FILE, title: 'Glossary' }

  await project.saveManifest()
  const files = await finish(io, env, 'Game')
  return { files, itemIds, convId, convNodes: cnodes.length, lines, mechanicIds, variableIds, entryIds }
}
