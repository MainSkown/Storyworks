// Restore one item, or the whole project, to a snapshot. A safety backup always comes first.
import { manifestSchema } from '../project/schemas/manifest'
import { serialize } from '../project/serialize'
import { TRASH_DIR } from '../project/trash'
import type { Env, ProjectIO, TrashEntry } from '../project/types'
import type { HistoryEngine } from './engine'
import { folderSource } from './folderSource'
import {
  SINGLETONS,
  STRUCTURAL_FIELDS,
  viewManifest,
  type Entry,
  type ItemType,
  type ManifestView,
} from './manifestView'
import { trackedFiles } from './tracked'
import { findNode, insertAfterPredecessor, type Obj, type TreeNode } from './manifestTree'


export type RestoreErrorCode = 'read-only' | 'version' | 'not-in-snapshot' | 'invalid' | 'failed'

export class RestoreError extends Error {
  readonly code: RestoreErrorCode
  constructor(code: RestoreErrorCode, message: string) {
    super(message)
    this.name = 'RestoreError'
    this.code = code
  }
}

/** What a whole-project restore reads from: a snapshot or a backup folder. */
export type SnapshotSource = Pick<HistoryEngine, 'readFile' | 'listTree'>

export interface RestoreDeps {
  env: Env
  readOnly: boolean
  /** Copies the current state aside; returns its name. A throw aborts the restore before anything changes. */
  makeSafetyBackup(): Promise<string>
}

export interface RestoreResult {
  safetyBackup: string
  /** Files written from the snapshot. */
  written: string[]
  /** Files moved to the Trash. */
  trashed: string[]
  manifestChanged: boolean
}

const TRASH_TYPES: Partial<Record<ItemType, TrashEntry['type']>> = {
  part: 'part', chapter: 'chapter', scene: 'scene', rule: 'rule', entry: 'entry', timeline: 'timeline',
}

const dec = new TextDecoder('utf-8', { fatal: true })
const dirOf = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf('/')))
const baseOf = (p: string) => p.split('/').pop() ?? p
const clone = <T>(v: T): T => structuredClone(v)

function asText(bytes: Uint8Array): string | null {
  try {
    return dec.decode(bytes)
  } catch {
    return null
  }
}

/** Writes only when the content differs. Text goes through the text path, binary through bytes. */
async function writeIfChanged(io: ProjectIO, path: string, bytes: Uint8Array): Promise<boolean> {
  const text = asText(bytes)
  if (text !== null) {
    if ((await io.readText(path)) === text) return false
    if (dirOf(path)) await io.mkdir(dirOf(path))
    await io.writeTextAtomic(path, text)
    return true
  }
  const cur = await io.readBytes(path).catch(() => null)
  if (cur && cur.length === bytes.length && cur.every((v, i) => v === bytes[i])) return false
  if (dirOf(path)) await io.mkdir(dirOf(path))
  await io.writeBytes(path, bytes)
  return true
}

async function snapshotManifest(engine: Pick<HistoryEngine, 'readFile'>, id: string): Promise<ManifestView> {
  const bytes = await engine.readFile(id, 'project.json')
  const view = bytes ? viewManifest(new TextDecoder().decode(bytes)) : null
  if (!view) throw new RestoreError('invalid', 'The snapshot has no readable project.json.')
  return view
}

async function currentManifest(io: ProjectIO): Promise<{ text: string; view: ManifestView }> {
  const text = await io.readText('project.json')
  const view = text === null ? null : viewManifest(text)
  if (text === null || !view) throw new RestoreError('invalid', 'project.json cannot be read, so nothing was restored.')
  return { text, view }
}

function guardWritable(deps: RestoreDeps) {
  if (deps.readOnly) throw new RestoreError('read-only', 'This book is open read-only, so it cannot be restored.')
}

const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : [])

/** Puts `entry` into `cur` (a mutable raw manifest) as the snapshot had it. */
function reAdd(cur: Obj, snap: ManifestView, entry: Entry): void {
  if (entry.key.startsWith('node:')) {
    const snapTree = snap.raw.manuscript as TreeNode[]
    const src = findNode(snapTree, entry.id)!
    const srcNode = src.list[src.index]
    const curTree = (cur.manuscript = arr(cur.manuscript) as TreeNode[])
    const existing = findNode(curTree, entry.id)
    if (existing) {
      const node = existing.list[existing.index]
      node.title = srcNode.title
      if (srcNode.path === undefined) delete node.path
      else node.path = srcNode.path
      return
    }
    const parentId = entry.parent.startsWith('node:') ? entry.parent.slice(5) : null
    const parentCur = parentId ? findNode(curTree, parentId) : null
    const target = parentCur ? parentCur.list[parentCur.index].children : curTree
    const parentSnap = parentId ? findNode(snapTree, parentId) : null
    const order = (parentSnap ? parentSnap.list[parentSnap.index].children : snapTree).map((n) => n.id)
    const node = { ...clone(srcNode), children: [] } as TreeNode
    // Parent gone: the item lands at the end of the root.
    if (parentId && !parentCur) target.push(node)
    else insertAfterPredecessor(target, node, order)
  } else if (entry.key in SINGLETONS) {
    cur[entry.key] = clone(snap.raw[entry.key])
  } else {
    const area = entry.parent.slice('area:'.length)
    const list = (cur[area] = arr(cur[area])) as Array<{ id: string } & Obj>
    const snapList = arr(snap.raw[area]) as Array<{ id: string } & Obj>
    const src = clone(snapList.find((r) => r.id === entry.id)!)
    const at = list.findIndex((r) => r.id === entry.id)
    if (at >= 0) list[at] = src
    else insertAfterPredecessor(list, src, snapList.map((r) => r.id))
  }
}

function dropTrashEntries(cur: Obj, ids: Set<string>): void {
  cur.trash = arr(cur.trash).filter((t) => !ids.has(t.id as string))
}

function validated(raw: Obj): string {
  const r = manifestSchema.safeParse(raw)
  if (!r.success) throw new RestoreError('invalid', `The restored project.json would be invalid: ${r.error.issues[0]?.message}`)
  return serialize(manifestSchema, r.data)
}

export async function restoreItem(
  engine: HistoryEngine,
  io: ProjectIO,
  snapshotId: string,
  key: string,
  deps: RestoreDeps,
): Promise<RestoreResult> {
  guardWritable(deps)
  const snap = await snapshotManifest(engine, snapshotId)
  const { text: curText, view: curView } = await currentManifest(io)
  const sameVersion = String(snap.version) === String(curView.version)

  let entry: Entry | undefined
  let paths: string[] = []
  if (key.startsWith('file:')) paths = [key.slice(5)]
  else if (key === 'settings') paths = []
  else {
    entry = snap.entries.find((e) => e.key === key)
    if (!entry) throw new RestoreError('not-in-snapshot', `${key} is not in this snapshot.`)
    if (entry.path) paths = [entry.path]
  }
  // Read everything needed first, so a missing file fails before the backup and before any change.
  const files: Array<[string, Uint8Array]> = []
  for (const p of paths) {
    const bytes = await engine.readFile(snapshotId, p)
    if (!bytes) throw new RestoreError('not-in-snapshot', `${p} is not in this snapshot.`)
    files.push([p, bytes])
  }

  let manifestText: string | null = null
  if (sameVersion && (entry || key === 'settings')) {
    const cur = clone(curView.raw) as Obj
    if (entry) {
      reAdd(cur, snap, entry)
      dropTrashEntries(cur, new Set([entry.id]))
    } else {
      for (const [k, v] of Object.entries(snap.raw)) if (!STRUCTURAL_FIELDS.has(k)) cur[k] = clone(v)
      for (const k of Object.keys(cur)) if (!STRUCTURAL_FIELDS.has(k) && !(k in snap.raw)) delete cur[k]
    }
    const next = validated(cur)
    if (next !== curText) manifestText = next
  }

  const safetyBackup = await deps.makeSafetyBackup()
  const written: string[] = []
  for (const [p, bytes] of files) if (await writeIfChanged(io, p, bytes)) written.push(p)
  if (manifestText !== null) await io.writeTextAtomic('project.json', manifestText)
  if (entry && manifestText !== null) await io.remove(`${TRASH_DIR}/${entry.id}`)
  return { safetyBackup, written, trashed: [], manifestChanged: manifestText !== null }
}

export async function restoreProject(
  engine: SnapshotSource,
  io: ProjectIO,
  snapshotId: string,
  deps: RestoreDeps,
): Promise<RestoreResult> {
  guardWritable(deps)
  const snap = await snapshotManifest(engine, snapshotId)
  const { text: curText, view: curView } = await currentManifest(io)
  if (String(snap.version) !== String(curView.version)) {
    throw new RestoreError('version', 'This snapshot was made by an older format of the app, so the whole book cannot be restored from it. Single items can.')
  }

  const snapKeys = new Set(snap.entries.map((e) => e.key))
  const snapIds = new Set(snap.entries.map((e) => e.id))
  const tree = (await engine.listTree(snapshotId)).filter((p) => p !== 'project.json' && !p.startsWith('.storyworks/'))
  const treeSet = new Set(tree)
  const contents: Array<[string, Uint8Array]> = []
  for (const p of tree) {
    const bytes = await engine.readFile(snapshotId, p)
    if (bytes) contents.push([p, bytes])
  }

  // Items present now but not in the snapshot go to the Trash.
  const deletedAt = new Date(deps.env.now()).toISOString()
  const gone = curView.entries.filter((e) => !snapKeys.has(e.key))
  const entries: TrashEntry[] = []
  const moves: Array<[string, string]> = []
  for (const e of gone) {
    const trashPath = e.path ? `${TRASH_DIR}/${e.id}/${baseOf(e.path)}` : ''
    if (e.path) moves.push([e.path, trashPath])
    const type = TRASH_TYPES[e.type]
    if (!type) continue
    const siblings = curView.entries.filter((x) => x.parent === e.parent)
    entries.push({
      id: e.id,
      type,
      title: e.title,
      originalPath: e.path ?? '',
      trashPath,
      parentId: e.parent.startsWith('node:') ? e.parent.slice(5) : null,
      index: siblings.findIndex((x) => x.key === e.key),
      deletedAt,
    })
  }
  const goneIds = new Set(entries.map((e) => e.id))
  // Loose assets and dictionaries that the snapshot does not have.
  const inDirs = (p: string) => [curView.dirs.assets, curView.dirs.dictionaries].some((d) => p.startsWith(`${d}/`))
  for (const p of await trackedFiles(io, curView)) {
    if (inDirs(p) && !treeSet.has(p)) moves.push([p, `${TRASH_DIR}/files/${p}`])
  }

  const next = clone(snap.raw) as Obj
  next.trash = [
    ...arr(curView.raw.trash).filter((t) => !goneIds.has(t.id as string) && !snapIds.has(t.id as string)),
    ...entries,
  ]
  const manifestText = validated(next)

  const safetyBackup = await deps.makeSafetyBackup()
  const done: Array<[string, string]> = []
  const trashed: string[] = []
  const written: string[] = []
  try {
    for (const [from, to] of moves) {
      if (!(await io.exists(from))) continue
      await io.mkdir(dirOf(to))
      await io.rename(from, to)
      done.push([from, to])
      trashed.push(from)
    }
    for (const [p, bytes] of contents) if (await writeIfChanged(io, p, bytes)) written.push(p)
    if (manifestText !== curText) await io.writeTextAtomic('project.json', manifestText)
  } catch (e) {
    for (const [from, to] of done.reverse()) await io.rename(to, from).catch(() => {})
    const why = e instanceof Error ? e.message : String(e)
    throw new RestoreError('failed', `Restore stopped (${why}). Your safety backup is "${safetyBackup}".`)
  }
  for (const id of snapIds) await io.remove(`${TRASH_DIR}/${id}`).catch(() => {})
  return { safetyBackup, written, trashed, manifestChanged: manifestText !== curText }
}

/** Whole-project restore from an automatic backup folder (a name from `listBackups`). */
export function restoreBackup(io: ProjectIO, name: string, deps: RestoreDeps): Promise<RestoreResult> {
  return restoreProject(folderSource(io, `.storyworks/backups/${name}`), io, name, deps)
}
