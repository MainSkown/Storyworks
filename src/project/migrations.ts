import type { z } from 'zod'
import { manifestSchema, MANIFEST_VERSION, type Manifest } from './schemas/manifest'
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

export const migrations: Migration[] = [v1to2]

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

/** Serializes every migrated file; manifest and scenes are checked against the current schemas. */
function validate(files: Map<string, unknown>): Map<string, string> | string {
  const manifest = files.get(MANIFEST_FILE)
  const parsed = parseFile(manifestSchema, JSON.stringify(manifest), MANIFEST_FILE)
  if (!parsed.ok) return `${MANIFEST_FILE}: ${parsed.error.field ?? ''} ${parsed.error.message}`
  const scenePaths = scenePathsOf(parsed.value)
  const out = new Map<string, string>()
  for (const [path, value] of files) {
    const text = JSON.stringify(value)
    let result: string | null = null
    if (path === MANIFEST_FILE) result = checked(manifestSchema, text, path)
    else if (scenePaths.has(path)) result = checked(sceneSchema, text, path)
    else out.set(path, JSON.stringify(value, null, 2) + '\n')
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
  const migrated = validate(files)
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
