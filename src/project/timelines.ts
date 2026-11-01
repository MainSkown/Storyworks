import { newTimeline } from '../timeline/ops'
import { timelineSchema, type Timeline } from '../timeline/schema'
import { ensureCalendar } from './calendar'
import { defaultNames } from './defaultNames'
import { parseFile } from './serialize'
import { moveFile, TRASH_DIR, undoMoves, type TrashHost } from './trash'
import type { Env, FileError, OpenProject, TrashEntry } from './types'

export const DEFAULT_TIMELINE_NAME = 'Main timeline'
export const timelinePath = (id: string) => `timelines/${id}.json`

export type TimelineStatus = 'ok' | 'missing' | 'invalid'

export interface LoadedTimelines {
  /** Only timelines that read and validated. */
  timelines: Map<string, Timeline>
  status: Map<string, TimelineStatus>
  errors: Map<string, FileError>
}

/** Reads every listed timeline; one bad file never blocks the others. */
export async function loadTimelines(project: OpenProject): Promise<LoadedTimelines> {
  const out: LoadedTimelines = { timelines: new Map(), status: new Map(), errors: new Map() }
  await Promise.all(
    project.manifest.timelines.map(async (ref) => {
      const text = await project.io.readText(ref.path)
      if (text === null) return void out.status.set(ref.id, 'missing')
      const r = parseFile(timelineSchema, text, ref.path)
      if (r.ok) {
        out.timelines.set(ref.id, r.value)
        out.status.set(ref.id, 'ok')
      } else {
        out.status.set(ref.id, 'invalid')
        out.errors.set(ref.id, r.error)
      }
    }),
  )
  // keep manifest order
  out.timelines = new Map(
    project.manifest.timelines.flatMap((r) => {
      const t = out.timelines.get(r.id)
      return t ? [[r.id, t] as const] : []
    }),
  )
  return out
}

/** Writes the file and lists it (at the end). */
export async function createTimelineFile(project: OpenProject, timeline: Timeline): Promise<void> {
  const path = timelinePath(timeline.id)
  await project.saveItem(path, timelineSchema, timeline)
  project.manifest.timelines = [
    ...project.manifest.timelines,
    { id: timeline.id, path, title: timeline.name },
  ]
  await project.saveManifest()
}

/**
 * Open-time defaults: a calendar when none is listed, and "Main timeline" when the book has no
 * timelines. Idempotent; does nothing when read-only. Saves right away (no autosave race at open).
 */
export async function ensureDefaults(
  project: OpenProject,
  env: Env,
  timelineName = defaultNames(project.manifest.language).timeline,
): Promise<void> {
  if (project.readOnly) return
  await ensureCalendar(project, env)
  if (project.manifest.timelines.length === 0) {
    await createTimelineFile(project, newTimeline(env.newId(), timelineName))
  }
}

export async function trashTimelineImpl(
  host: TrashHost,
  id: string,
  title: string,
): Promise<TrashEntry> {
  host.assertWritable()
  const { manifest, io } = host
  const index = manifest.timelines.findIndex((r) => r.id === id)
  if (index < 0) throw new Error(`Cannot delete ${id}: not a listed timeline`)
  const ref = manifest.timelines[index]
  const trashPath = `${TRASH_DIR}/${id}/${ref.path.split('/').pop() ?? ''}`
  const moves: [string, string][] = []
  try {
    if (await io.exists(ref.path)) {
      await moveFile(host, ref.path, trashPath)
      moves.push([ref.path, trashPath])
    }
    const entry: TrashEntry = {
      id,
      type: 'timeline',
      title,
      originalPath: ref.path,
      trashPath,
      parentId: null,
      index,
      deletedAt: new Date(host.env.now()).toISOString(),
    }
    const before = { timelines: manifest.timelines, trash: manifest.trash }
    manifest.timelines = manifest.timelines.filter((r) => r.id !== id)
    manifest.trash = [...manifest.trash, entry]
    try {
      await host.saveManifest()
    } catch (e) {
      Object.assign(manifest, before)
      throw e
    }
    return entry
  } catch (e) {
    await undoMoves(host, moves)
    throw e
  }
}

export async function restoreTimelineImpl(host: TrashHost, id: string): Promise<void> {
  host.assertWritable()
  const { manifest, io } = host
  const entry = manifest.trash.find((t) => t.id === id && t.type === 'timeline')
  if (!entry) throw new Error(`Cannot restore ${id}: not a timeline in the trash`)
  if (await io.exists(entry.originalPath))
    throw new Error(`Cannot restore ${id}: ${entry.originalPath} already exists`)
  const moves: [string, string][] = []
  try {
    if (await io.exists(entry.trashPath)) {
      await moveFile(host, entry.trashPath, entry.originalPath)
      moves.push([entry.trashPath, entry.originalPath])
    }
    const before = { timelines: manifest.timelines, trash: manifest.trash }
    const list = [...manifest.timelines]
    list.splice(Math.min(entry.index, list.length), 0, {
      id,
      path: entry.originalPath,
      title: entry.title,
    })
    manifest.timelines = list
    manifest.trash = manifest.trash.filter((t) => t.id !== id)
    try {
      await host.saveManifest()
    } catch (e) {
      Object.assign(manifest, before)
      throw e
    }
  } catch (e) {
    await undoMoves(host, moves)
    throw e
  }
}
