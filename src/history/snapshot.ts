import type { ProjectIO, Env } from '../project/types'
import { HistoryError, type FileChange, type HistoryEngine } from './engine'
import { buildChangeItems, type ChangeItem } from './items'
import { viewManifest, type ManifestView } from './manifestView'
import { planSnapshot } from './partial'
import { trackedFiles } from './tracked'

const dec = new TextDecoder()
const enc = new TextEncoder()

async function workingView(io: ProjectIO): Promise<ManifestView> {
  const text = await io.readText('project.json')
  const view = text === null ? null : viewManifest(text)
  if (!view) throw new HistoryError('manifest', 'project.json cannot be read, so changes cannot be listed.')
  return view
}

async function snapshotView(engine: HistoryEngine, id: string): Promise<ManifestView | null> {
  const bytes = await engine.readFile(id, 'project.json')
  if (!bytes) return null
  const view = viewManifest(dec.decode(bytes))
  if (!view) throw new HistoryError('corrupt', 'A saved snapshot has an unreadable project.json.')
  return view
}

async function current(engine: HistoryEngine, io: ProjectIO) {
  await engine.check()
  const newView = await workingView(io)
  const head = (await engine.log())[0]
  const oldView = head ? await snapshotView(engine, head.id) : null
  const files = await engine.status(await trackedFiles(io, newView))
  return { newView, oldView, files, items: buildChangeItems(oldView, newView, files) }
}

/** Items changed in the project folder since the last snapshot. */
export async function loadChanges(engine: HistoryEngine, io: ProjectIO): Promise<ChangeItem[]> {
  return (await current(engine, io)).items
}

/** Items changed by one snapshot, compared with the snapshot before it. */
export async function snapshotChanges(engine: HistoryEngine, id: string): Promise<ChangeItem[]> {
  const log = await engine.log()
  const at = log.findIndex((s) => s.id === id)
  if (at < 0) throw new HistoryError('corrupt', 'Unknown snapshot.')
  const newView = await snapshotView(engine, id)
  if (!newView) throw new HistoryError('corrupt', 'A saved snapshot has no project.json.')
  const parent = log[at + 1]
  const oldView = parent ? await snapshotView(engine, parent.id) : null
  const files: FileChange[] = await engine.changedFiles(id)
  return buildChangeItems(oldView, newView, files)
}

export interface SnapshotResult {
  id: string
  keys: string[]
  pulledIn: string[]
  forcedAll: boolean
}

export async function createSnapshot(
  engine: HistoryEngine,
  io: ProjectIO,
  env: Env,
  opts: { keys: string[] | 'all'; message?: string },
): Promise<SnapshotResult> {
  const { newView, oldView, items } = await current(engine, io)
  const plan = planSnapshot({ oldView, newView, items, selected: opts.keys })
  if (plan.keys.length === 0) throw new HistoryError('nothing-to-commit', 'Nothing to snapshot.')
  const include = plan.takeManifest ? [...plan.include, 'project.json'] : plan.include
  const overrides: Record<string, Uint8Array> = plan.manifest ? { 'project.json': enc.encode(plan.manifest) } : {}
  const message = opts.message?.trim() || new Date(env.now()).toISOString().slice(0, 16).replace('T', ' ')
  const id = await engine.commit({ message, include, overrides })
  return { id, keys: plan.keys, pulledIn: plan.pulledIn, forcedAll: plan.forcedAll }
}
