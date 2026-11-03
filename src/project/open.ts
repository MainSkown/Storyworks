import { z } from 'zod'
import { sha256Hex } from './hash'
import { newId } from './ids'
import {
  MANIFEST_FILE,
  migrateProject,
  migrations as defaultMigrations,
  type Migration,
} from './migrations'
import {
  BOOK_KIND,
  createManifest,
  manifestSchema,
  MANIFEST_VERSION,
  peekManifestHeader,
  type BookMeta,
  type Manifest,
} from './schemas/manifest'
import { ignoredSchema } from './schemas/ignored'
import { statsSchema } from './schemas/stats'
import { inboxSchema } from './schemas/inbox'
import { codexEntrySchema } from './schemas/codexEntry'
import { codexTypeSchema } from './schemas/codexType'
import { groupSchema } from './schemas/group'
import { relationLayoutSchema } from './schemas/relationLayout'
import { relationshipSchema } from './schemas/relationship'
import { relationTypeSchema } from './schemas/relationType'
import { ruleSchema } from './schemas/rule'
import { ruleCategorySchema } from './schemas/ruleCategory'
import { stateKindSchema } from './schemas/stateKind'
import { knowledgeItemSchema } from './schemas/knowledge'
import { sceneSchema, SCENE_VERSION } from './schemas/scene'
import { timelineSchema } from '../timeline/schema'
import { parseFile, serialize } from './serialize'
import {
  deleteItemImpl,
  dropTrashedNodeImpl,
  dropTrashedNoteImpl,
  readTrashedNoteImpl,
  restoreItemImpl,
  restoreNodeImpl,
  restoreEntryImpl,
  restoreRuleImpl,
  trashNodeImpl,
  trashNoteImpl,
  trashEntryImpl,
  trashRuleImpl,
  type TrashHost,
} from './trash'
import { restoreTimelineImpl, trashTimelineImpl } from './timelines'
import type {
  Env,
  FileError,
  Issue,
  OpenProject,
  OpenResult,
  ParseResult,
  ProjectIO,
  ReadOnlyReason,
} from './types'

export const defaultEnv: Env = { now: () => Date.now(), newId }

const INTERNAL_PREFIX = '.storyworks/'

export interface OpenOptions {
  migrations?: Migration[]
  /** Opens read-only for this reason (e.g. 'locked-elsewhere'); never writes. Ignored if the file is read-only anyway. */
  forceReadOnly?: ReadOnlyReason
}

export interface ListedItem {
  id: string
  path: string
  scene: boolean
  inbox?: boolean
  ignored?: boolean
  stats?: boolean
  timeline?: boolean
  rule?: boolean
  ruleCategory?: boolean
  codexEntry?: boolean
  codexType?: boolean
  relationType?: boolean
  relationship?: boolean
  group?: boolean
  relationLayout?: boolean
  stateKind?: boolean
  knowledge?: boolean
}

/** Every item file the manifest points at (trash excluded). */
export function listedItems(m: Manifest): ListedItem[] {
  const out: ListedItem[] = []
  const walk = (nodes: Manifest['manuscript']) => {
    for (const n of nodes) {
      if (n.path) out.push({ id: n.id, path: n.path, scene: n.type === 'scene' })
      walk(n.children)
    }
  }
  walk(m.manuscript)
  const refs = [m.calendar, m.inbox, m.ignoredFindings, m.stats, m.relationLayout]
  const lists = [
    m.timelines,
    m.rules,
    m.ruleCategories,
    m.codexTypes,
    m.codexEntries,
    m.relationTypes,
    m.relationships,
    m.groups,
    m.stateKinds,
    m.knowledge,
  ]
  for (const ref of [...refs, ...lists.flat()]) {
    if (ref) out.push({
      id: ref.id,
      path: ref.path,
      scene: false,
      inbox: ref === m.inbox,
      ignored: ref === m.ignoredFindings,
      stats: ref === m.stats,
      timeline: m.timelines.includes(ref),
      rule: m.rules.includes(ref),
      ruleCategory: m.ruleCategories.includes(ref),
      codexEntry: m.codexEntries.includes(ref),
      codexType: m.codexTypes.includes(ref),
      relationType: m.relationTypes.includes(ref),
      relationship: m.relationships.includes(ref),
      group: m.groups.includes(ref),
      relationLayout: ref === m.relationLayout,
      stateKind: m.stateKinds.includes(ref),
      knowledge: m.knowledge.includes(ref),
    })
  }
  return out
}

/** Accepts a newer version / unknown kind: unknown top-level keys are dropped, version is pinned. */
const lenientManifestSchema = z.object({ ...manifestSchema.shape, version: z.number() })

function parseManifest(text: string, readOnly: boolean): ParseResult<Manifest> {
  if (!readOnly) return parseFile(manifestSchema, text, MANIFEST_FILE)
  const r = parseFile(lenientManifestSchema, text, MANIFEST_FILE)
  return r.ok
    ? { ok: true as const, value: { ...r.value, version: MANIFEST_VERSION } as Manifest }
    : r
}

export function readOnlyReasonOf(header: { version: number | null; kind: string | null } | null) {
  if (!header) return null
  if (header.version !== null && header.version > MANIFEST_VERSION) return 'newer-version' as const
  if (header.kind !== null && header.kind !== BOOK_KIND) return 'unknown-kind' as const
  return null
}

function jsonParses(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

function refuse(
  reason: 'invalid-json' | 'invalid-schema',
  error: FileError,
): Extract<OpenResult, { status: 'refused' }> {
  return { status: 'refused', reason, error }
}

interface Tracking {
  hashes: Map<string, string>
  invalid: Set<string>
}

/** Builds the open project; every write goes through one guarded path (`write`). */
function buildProject(
  io: ProjectIO,
  env: Env,
  manifest: Manifest,
  readOnly: { reason: ReadOnlyReason } | null,
  { hashes, invalid }: Tracking,
): OpenProject {
  async function write(path: string, text: string): Promise<void> {
    if (readOnly) throw new Error(`Project is read-only (${readOnly.reason}); not writing ${path}`)
    if (invalid.has(path)) throw new Error(`${path} is invalid on disk; refusing to overwrite it`)
    const hash = await sha256Hex(text)
    if (hashes.get(path) === hash) return
    await io.writeTextAtomic(path, text)
    hashes.set(path, hash)
  }

  const host: TrashHost = {
    io,
    env,
    manifest,
    assertWritable() {
      if (readOnly) throw new Error(`Project is read-only (${readOnly.reason})`)
    },
    saveManifest: () => project.saveManifest(),
    moveTracking(from, to) {
      const hash = hashes.get(from)
      if (hash !== undefined) hashes.set(to, hash)
      hashes.delete(from)
      if (invalid.delete(from)) invalid.add(to)
    },
  }

  const project: OpenProject = {
    manifest,
    readOnly,
    io,
    async saveItem(path, schema, value) {
      await write(path, serialize(schema, value))
    },
    async saveManifest() {
      await write(MANIFEST_FILE, serialize(manifestSchema, manifest))
    },
    knownHash: (path) => hashes.get(path),
    isInvalid: (path) => invalid.has(path),
    async reloadItem(path) {
      const text = await io.readText(path)
      if (text === null) return { status: 'missing' }
      hashes.set(path, await sha256Hex(text))
      const item = listedItems(manifest).find((i) => i.path === path)
      if (!item || !isParsed(item)) return { status: 'ok' }
      const r = parseItem(item, text)
      if (r.ok) {
        invalid.delete(path)
        return { status: 'ok' }
      }
      invalid.add(path)
      return { status: 'invalid', error: r.error }
    },
    deleteItem: (id) => deleteItemImpl(host, id),
    restoreItem: (id) => restoreItemImpl(host, id),
    trashNote: (note, index) => trashNoteImpl(host, note, index),
    readTrashedNote: (id) => readTrashedNoteImpl(host, id),
    dropTrashedNote: (id) => dropTrashedNoteImpl(host, id),
    trashTimeline: (id, title) => trashTimelineImpl(host, id, title),
    restoreTimeline: (id) => restoreTimelineImpl(host, id),
    trashNode: (item) => trashNodeImpl(host, item),
    restoreNode: (id, timelines) => restoreNodeImpl(host, id, timelines),
    dropTrashedNode: (id) => dropTrashedNodeImpl(host, id),
    trashRule: (id, title) => trashRuleImpl(host, id, title),
    restoreRule: (id) => restoreRuleImpl(host, id),
    trashEntry: (id, title) => trashEntryImpl(host, id, title),
    restoreEntry: (id) => restoreEntryImpl(host, id),
  }
  return project
}

/** Creates a new book: Chapter 1 with one scene. Refuses to touch an existing project. */
export async function createProject(
  io: ProjectIO,
  meta: BookMeta,
  env: Env = defaultEnv,
): Promise<OpenProject> {
  if (await io.exists(MANIFEST_FILE)) throw new Error(`${MANIFEST_FILE} already exists`)
  const manifest = createManifest(meta, env)
  const project = buildProject(io, env, manifest, null, { hashes: new Map(), invalid: new Set() })
  const node = manifest.manuscript[0].children[0]
  const scene = sceneSchema.parse({
    version: SCENE_VERSION,
    id: node.id,
    title: node.title,
    content: { type: 'doc', content: [] },
  })
  await project.saveItem(node.path as string, sceneSchema, scene)
  await project.saveManifest()
  return project
}

/** A scene, rule or category file must carry the id project.json lists it under, or links and trash would point at the wrong item. */
function withIdCheck<T extends { id: string }>(
  r: ParseResult<T>,
  path: string,
  expectedId: string | undefined,
): ParseResult<T> {
  if (r.ok && expectedId !== undefined && r.value.id !== expectedId) {
    return {
      ok: false as const,
      error: {
        file: path,
        field: 'id',
        message: `id "${r.value.id}" does not match "${expectedId}" in project.json`,
      },
    }
  }
  return r
}

export function parseItem(item: ListedItem, text: string): ParseResult<unknown> {
  if (item.inbox) return parseFile(inboxSchema, text, item.path)
  if (item.ignored) return parseFile(ignoredSchema, text, item.path)
  if (item.stats) return parseFile(statsSchema, text, item.path)
  if (item.timeline) return parseFile(timelineSchema, text, item.path)
  if (item.rule) return withIdCheck(parseFile(ruleSchema, text, item.path), item.path, item.id)
  if (item.ruleCategory)
    return withIdCheck(parseFile(ruleCategorySchema, text, item.path), item.path, item.id)
  if (item.codexEntry)
    return withIdCheck(parseFile(codexEntrySchema, text, item.path), item.path, item.id)
  if (item.codexType)
    return withIdCheck(parseFile(codexTypeSchema, text, item.path), item.path, item.id)
  if (item.relationType)
    return withIdCheck(parseFile(relationTypeSchema, text, item.path), item.path, item.id)
  if (item.relationship)
    return withIdCheck(parseFile(relationshipSchema, text, item.path), item.path, item.id)
  if (item.group) return withIdCheck(parseFile(groupSchema, text, item.path), item.path, item.id)
  if (item.stateKind)
    return withIdCheck(parseFile(stateKindSchema, text, item.path), item.path, item.id)
  if (item.knowledge)
    return withIdCheck(parseFile(knowledgeItemSchema, text, item.path), item.path, item.id)
  if (item.relationLayout) return parseFile(relationLayoutSchema, text, item.path)
  return withIdCheck(parseFile(sceneSchema, text, item.path), item.path, item.id)
}

export const isParsed = (item: ListedItem) =>
  item.scene ||
  item.inbox ||
  item.ignored ||
  item.stats ||
  item.timeline ||
  item.rule ||
  item.ruleCategory ||
  item.codexEntry ||
  item.codexType ||
  item.relationType ||
  item.relationship ||
  item.group ||
  item.stateKind ||
  item.knowledge ||
  item.relationLayout

async function checkItems(io: ProjectIO, items: ListedItem[], t: Tracking): Promise<Issue[]> {
  const results = await Promise.all(
    items.map(async (item): Promise<Issue | null> => {
      const text = await io.readText(item.path)
      if (text === null) return { kind: 'missing', itemId: item.id, path: item.path }
      t.hashes.set(item.path, await sha256Hex(text))
      if (!isParsed(item)) return null
      const r = parseItem(item, text)
      if (r.ok) return null
      t.invalid.add(item.path)
      return { kind: 'invalid', itemId: item.id, path: item.path, error: r.error }
    }),
  )
  return results.filter((i): i is Issue => i !== null)
}

async function findUnlisted(io: ProjectIO, m: Manifest, items: ListedItem[]): Promise<Issue[]> {
  const known = new Set([MANIFEST_FILE, ...items.map((i) => i.path)])
  const skipDirs = [m.dirs.assets, m.dirs.dictionaries].map((d) => `${d.replace(/\/$/, '')}/`)
  return (await io.listFiles(''))
    .filter(
      (p) =>
        !known.has(p) && !p.startsWith(INTERNAL_PREFIX) && !skipDirs.some((d) => p.startsWith(d)),
    )
    .map((path) => ({ kind: 'unlisted', path }))
}

export async function openProject(
  io: ProjectIO,
  env: Env = defaultEnv,
  options: OpenOptions = {},
): Promise<OpenResult> {
  let text = await io.readText(MANIFEST_FILE)
  if (text === null) {
    return refuse('invalid-json', { file: MANIFEST_FILE, message: `${MANIFEST_FILE} not found` })
  }
  const header = peekManifestHeader(text)
  const reason: ReadOnlyReason | null = readOnlyReasonOf(header)

  if (!reason && header?.version != null && header.version < MANIFEST_VERSION) {
    const registry = options.migrations ?? defaultMigrations
    const m = await migrateProject(io, env, text, header.version, registry)
    if (!m.ok) return { status: 'migration-failed', error: m.error }
    text = (await io.readText(MANIFEST_FILE)) ?? text
  }

  const parsed = parseManifest(text, reason !== null)
  if (!parsed.ok) {
    return refuse(jsonParses(text) ? 'invalid-schema' : 'invalid-json', parsed.error)
  }
  const manifest = parsed.value
  const tracking: Tracking = {
    hashes: new Map([[MANIFEST_FILE, await sha256Hex(text)]]),
    invalid: new Set(),
  }
  const items = listedItems(manifest)
  const issues = [
    ...(await checkItems(io, items, tracking)),
    ...(await findUnlisted(io, manifest, items)),
  ]
  const effective = reason ?? options.forceReadOnly ?? null
  const project = buildProject(
    io,
    env,
    manifest,
    effective ? { reason: effective } : null,
    tracking,
  )
  return { status: 'ok', project, issues }
}
