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
import { sceneSchema, SCENE_VERSION } from './schemas/scene'
import { parseFile, serialize } from './serialize'
import { deleteItemImpl, restoreItemImpl, type TrashHost } from './trash'
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
}

interface ListedItem {
  id: string
  path: string
  scene: boolean
}

/** Every item file the manifest points at (trash excluded). */
function listedItems(m: Manifest): ListedItem[] {
  const out: ListedItem[] = []
  const walk = (nodes: Manifest['manuscript']) => {
    for (const n of nodes) {
      if (n.path) out.push({ id: n.id, path: n.path, scene: n.type === 'scene' })
      walk(n.children)
    }
  }
  walk(m.manuscript)
  const refs = [m.calendar, m.inbox, m.ignoredFindings]
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
    if (ref) out.push({ id: ref.id, path: ref.path, scene: false })
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

function readOnlyReasonOf(header: { version: number | null; kind: string | null } | null) {
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
    deleteItem: (id) => deleteItemImpl(host, id),
    restoreItem: (id) => restoreItemImpl(host, id),
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

async function checkItems(io: ProjectIO, items: ListedItem[], t: Tracking): Promise<Issue[]> {
  const results = await Promise.all(
    items.map(async (item): Promise<Issue | null> => {
      const text = await io.readText(item.path)
      if (text === null) return { kind: 'missing', itemId: item.id, path: item.path }
      t.hashes.set(item.path, await sha256Hex(text))
      if (!item.scene) return null
      const r = parseFile(sceneSchema, text, item.path)
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
  const project = buildProject(io, env, manifest, reason ? { reason } : null, tracking)
  return { status: 'ok', project, issues }
}
