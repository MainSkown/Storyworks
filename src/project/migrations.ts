import type { z } from 'zod'
import { defaultExportOptions } from '../export/options'
import { defaultScriptExportOptions } from '../export/scriptOptions'
import { manifestSchema, MANIFEST_VERSION, type Manifest } from './schemas/manifest'
import { codexEntrySchema } from './schemas/codexEntry'
import { sceneSchema } from './schemas/scene'
import { parseFile, serialize } from './serialize'
import type { Env, ProjectIO } from './types'

/** Pure step over the parsed JSON of every project file, keyed by root-relative path. */
export interface Migration {
  from: number
  to: number
  migrate(files: Map<string, unknown>): Map<string, unknown>
}

/** Scene file paths named by a raw manifest (live tree and trash). */
function rawScenePaths(manifest: unknown): Set<string> {
  const out = new Set<string>()
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return
    for (const n of nodes as Record<string, unknown>[]) {
      if (n?.type === 'scene' && typeof n.path === 'string') out.add(n.path)
      walk(n?.children)
    }
  }
  const m = manifest as { manuscript?: unknown; trash?: unknown }
  walk(m?.manuscript)
  if (Array.isArray(m?.trash))
    for (const t of m.trash as Record<string, unknown>[])
      if (t?.type === 'scene' && typeof t.trashPath === 'string') out.add(t.trashPath)
  return out
}

/** Codex entry file paths named by a raw manifest (listed and trashed). */
function rawEntryPaths(manifest: unknown): Set<string> {
  const out = new Set<string>()
  const m = manifest as { codexEntries?: unknown; trash?: unknown }
  if (Array.isArray(m?.codexEntries))
    for (const r of m.codexEntries as Record<string, unknown>[])
      if (typeof r?.path === 'string') out.add(r.path)
  if (Array.isArray(m?.trash))
    for (const t of m.trash as Record<string, unknown>[])
      if (t?.type === 'entry' && typeof t.trashPath === 'string') out.add(t.trashPath)
  return out
}

/** v1 -> v2: scene `todos`, strict comment shape, manifest version. */
const v1to2: Migration = {
  from: 1,
  to: 2,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, { ...manifest, version: 2 })
    for (const path of rawScenePaths(manifest)) {
      const scene = files.get(path) as Record<string, unknown> | undefined
      if (!scene) continue
      const comments = Array.isArray(scene.comments) ? scene.comments : []
      out.set(path, {
        ...scene,
        version: 2,
        todos: scene.todos ?? [],
        comments: comments.map((c: Record<string, unknown>) => ({
          id: c.id,
          text: typeof c.text === 'string' ? c.text : '',
          createdAt: typeof c.createdAt === 'string' ? c.createdAt : '',
          resolved: typeof c.resolved === 'boolean' ? c.resolved : false,
        })),
      })
    }
    return out
  },
}

/** v2 -> v3: manifest version only (trash entries gain the 'timeline' type; none exist yet). */
const v2to3: Migration = {
  from: 2,
  to: 3,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, { ...manifest, version: 3 })
    return out
  },
}

/** v3 -> v4: manifest version only (trash entries gain the 'node' type; none exist yet). */
const v3to4: Migration = {
  from: 3,
  to: 4,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, { ...manifest, version: 4 })
    return out
  },
}

/** v4 -> v5: manifest version only (trash entries gain the 'rule' type; none exist yet). */
const v4to5: Migration = {
  from: 4,
  to: 5,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, { ...manifest, version: 5 })
    return out
  },
}

/** v5 -> v6: manifest version only (trash entries gain the 'entry' type; none exist yet). */
const v5to6: Migration = {
  from: 5,
  to: 6,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, { ...manifest, version: 6 })
    return out
  },
}

/** v6 -> v7: manifest version only (`relationLayout` ref defaults to null). */
const v6to7: Migration = {
  from: 6,
  to: 7,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, { ...manifest, version: 7 })
    return out
  },
}

/** v7 -> v8: manifest version; codex entry files v1 -> v2 (`states: []`). Other entry files are left as they are. */
const v7to8: Migration = {
  from: 7,
  to: 8,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, { ...manifest, version: 8 })
    for (const path of rawEntryPaths(manifest)) {
      const entry = files.get(path) as Record<string, unknown> | undefined
      if (typeof entry !== 'object' || entry === null || entry.version !== 1) continue
      const next = { ...entry, version: 2, states: entry.states ?? [] }
      // A broken file is left exactly as it is (it shows up as an invalid file after opening).
      if (codexEntrySchema.safeParse(next).success) out.set(path, next)
    }
    return out
  },
}

/** v8 -> v9: manifest version; scene files v2 -> v3 (links may carry `to.entry`; nothing else changes). */
const v8to9: Migration = {
  from: 8,
  to: 9,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, { ...manifest, version: 9 })
    for (const path of rawScenePaths(manifest)) {
      const scene = files.get(path) as Record<string, unknown> | undefined
      if (typeof scene !== 'object' || scene === null || scene.version !== 2) continue
      const next = { ...scene, version: 3 }
      // A broken file is left exactly as it is (it shows up as an invalid file after opening).
      if (sceneSchema.safeParse(next).success) out.set(path, next)
    }
    return out
  },
}

/** v9 -> v10: manifest only (`checkSettings: {}`: every check enabled). */
const v9to10: Migration = {
  from: 9,
  to: 10,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, {
      ...manifest,
      version: 10,
      checkSettings: manifest.checkSettings ?? {},
    })
    return out
  },
}

/** v10 -> v11: manifest only (`exportSettings`: default export options). */
const v10to11: Migration = {
  from: 10,
  to: 11,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, {
      ...manifest,
      version: 11,
      exportSettings: manifest.exportSettings ?? defaultExportOptions(),
    })
    return out
  },
}

/** v11 -> v12: manifest only (`stats` slot; dictionary names become `{ name, scope: 'global' }`). */
const v11to12: Migration = {
  from: 11,
  to: 12,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    const old = Array.isArray(manifest.dictionaries) ? manifest.dictionaries : []
    out.set(MANIFEST_FILE, {
      ...manifest,
      version: 12,
      // Anything that is not a name stays as it is and fails validation.
      dictionaries: old.map((d) => (typeof d === 'string' ? { name: d, scope: 'global' } : d)),
      stats: manifest.stats ?? null,
    })
    return out
  },
}

/** v12 -> v13: manifest only (`titlePage`). */
const v12to13: Migration = {
  from: 12,
  to: 13,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, {
      ...manifest,
      version: 13,
      titlePage: manifest.titlePage ?? { contact: '', date: '' },
    })
    return out
  },
}

/** v13 -> v14: manifest only (`scriptExport`: screenplay export options). */
const v13to14: Migration = {
  from: 13,
  to: 14,
  migrate(files) {
    const out = new Map(files)
    const manifest = files.get(MANIFEST_FILE) as Record<string, unknown>
    out.set(MANIFEST_FILE, {
      ...manifest,
      version: 14,
      scriptExport: manifest.scriptExport ?? defaultScriptExportOptions(),
    })
    return out
  },
}

export const migrations: Migration[] = [
  v1to2,
  v2to3,
  v3to4,
  v4to5,
  v5to6,
  v6to7,
  v7to8,
  v8to9,
  v9to10,
  v10to11,
  v11to12,
  v12to13,
  v13to14,
]

export const MANIFEST_FILE = 'project.json'
const INTERNAL_DIR = '.storyworks'

export type MigrationResult = { ok: true } | { ok: false; error: string }

const fail = (error: string): MigrationResult => ({ ok: false, error })
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function planSteps(registry: Migration[], from: number, target: number): Migration[] | string {
  const steps: Migration[] = []
  for (let v = from; v < target;) {
    const step = registry.find((m) => m.from === v)
    if (!step || step.to <= v) return `No migration from version ${v}`
    steps.push(step)
    v = step.to
  }
  return steps
}

/** Paths of item files a raw (possibly old) manifest points at, including trashed ones. */
function itemPaths(raw: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(raw)) raw.forEach((v) => itemPaths(v, out))
  else if (typeof raw === 'object' && raw !== null) {
    for (const [key, value] of Object.entries(raw)) {
      if ((key === 'path' || key === 'trashPath') && typeof value === 'string' && value)
        out.add(value)
      else itemPaths(value, out)
    }
  }
  return out
}

async function readFiles(
  io: ProjectIO,
  paths: string[],
): Promise<{ texts: Map<string, string>; values: Map<string, unknown> } | string> {
  const texts = new Map<string, string>()
  const values = new Map<string, unknown>()
  for (const path of paths) {
    const text = await io.readText(path)
    if (text === null) continue
    try {
      values.set(path, JSON.parse(text))
    } catch {
      return `${path} is not valid JSON`
    }
    texts.set(path, text)
  }
  return { texts, values }
}

const ERR = '\0error:'

/** Serialized text, or ERR-prefixed message when the file does not validate. */
function checked<T>(schema: z.ZodType<T>, text: string, path: string): string {
  const r = parseFile(schema, text, path)
  if (!r.ok) return `${ERR}${path}: ${r.error.field ?? ''} ${r.error.message}`
  return serialize(schema, r.value)
}

/**
 * Serializes every migrated file; manifest and scenes are checked against the current schemas.
 * An invalid scene that the migration did not change is skipped (shown as invalid after opening).
 */
function validate(
  files: Map<string, unknown>,
  original: Map<string, unknown>,
): Map<string, string> | string {
  const manifest = files.get(MANIFEST_FILE)
  const parsed = parseFile(manifestSchema, JSON.stringify(manifest), MANIFEST_FILE)
  if (!parsed.ok) return `${MANIFEST_FILE}: ${parsed.error.field ?? ''} ${parsed.error.message}`
  const scenePaths = scenePathsOf(parsed.value)
  const out = new Map<string, string>()
  for (const [path, value] of files) {
    const text = JSON.stringify(value)
    let result: string | null = null
    if (path === MANIFEST_FILE) result = checked(manifestSchema, text, path)
    else if (scenePaths.has(path)) {
      result = checked(sceneSchema, text, path)
      // A scene that was already broken and that no step touched is left as it is, not a failure.
      if (result.startsWith(ERR) && text === JSON.stringify(original.get(path))) {
        out.set(path, text)
        continue
      }
    } else out.set(path, JSON.stringify(value, null, 2) + '\n')
    if (result?.startsWith(ERR)) return result.slice(ERR.length)
    if (result !== null) out.set(path, result)
  }
  return out
}

function scenePathsOf(manifest: Manifest): Set<string> {
  const out = new Set<string>()
  const walk = (nodes: Manifest['manuscript']) => {
    for (const n of nodes) {
      if (n.type === 'scene' && n.path) out.add(n.path)
      walk(n.children)
    }
  }
  walk(manifest.manuscript)
  for (const t of manifest.trash) if (t.type === 'scene') out.add(t.trashPath)
  return out
}

/** Copies the whole project (except .storyworks/) into `backupDir`. */
async function backup(io: ProjectIO, backupDir: string): Promise<void> {
  const files = (await io.listFiles('')).filter((p) => !p.startsWith(`${INTERNAL_DIR}/`))
  const dirs = new Set<string>()
  for (const path of files) {
    const slash = path.indexOf('/')
    if (slash === -1)
      await io.writeTextAtomic(`${backupDir}/${path}`, (await io.readText(path)) ?? '')
    else dirs.add(path.slice(0, slash))
  }
  for (const dir of dirs) await io.copyTree(dir, `${backupDir}/${dir}`)
}

async function restore(io: ProjectIO, backupDir: string, paths: string[]): Promise<void> {
  for (const path of paths) {
    const text = await io.readText(`${backupDir}/${path}`)
    if (text !== null) await io.writeTextAtomic(path, text)
  }
}

/**
 * Migrates the project at `fromVersion` to the current manifest version.
 * Everything is computed and validated in memory first; nothing is written if that fails.
 * Then: backup, write, and on a write failure restore from the backup.
 */
export async function migrateProject(
  io: ProjectIO,
  env: Env,
  manifestText: string,
  fromVersion: number,
  registry: Migration[] = migrations,
): Promise<MigrationResult> {
  const steps = planSteps(registry, fromVersion, MANIFEST_VERSION)
  if (typeof steps === 'string') return fail(steps)
  let raw: unknown
  try {
    raw = JSON.parse(manifestText)
  } catch {
    return fail(`${MANIFEST_FILE} is not valid JSON`)
  }
  const read = await readFiles(io, [MANIFEST_FILE, ...itemPaths(raw)])
  if (typeof read === 'string') return fail(read)

  let files = read.values
  try {
    for (const step of steps) files = step.migrate(files)
  } catch (e) {
    return fail(`Migration failed: ${message(e)}`)
  }
  const migrated = validate(files, read.values)
  if (typeof migrated === 'string') return fail(`Migrated file is invalid: ${migrated}`)

  const stamp = new Date(env.now()).toISOString().replace(/[:.]/g, '-')
  const backupDir = `${INTERNAL_DIR}/backups/pre-migration-v${fromVersion}-${stamp}`
  try {
    await backup(io, backupDir)
  } catch (e) {
    return fail(`Backup failed, nothing was changed: ${message(e)}`)
  }
  const written: string[] = []
  try {
    // Manifest last: its version only flips once every item is migrated.
    const order = [...migrated].sort(
      ([a], [b]) => Number(a === MANIFEST_FILE) - Number(b === MANIFEST_FILE),
    )
    for (const [path, text] of order) {
      // Files the migration did not change are not rewritten (keeps their text byte-identical).
      if (
        path !== MANIFEST_FILE &&
        JSON.stringify(files.get(path)) === JSON.stringify(read.values.get(path))
      )
        continue
      written.push(path)
      await io.writeTextAtomic(path, text)
    }
  } catch (e) {
    try {
      await restore(io, backupDir, written)
    } catch (e2) {
      return fail(
        `Write failed (${message(e)}) and restore failed (${message(e2)}); backup is in ${backupDir}`,
      )
    }
    return fail(`Write failed, project restored from backup: ${message(e)}`)
  }
  return { ok: true }
}
