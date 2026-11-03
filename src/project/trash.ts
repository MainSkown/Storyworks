import { docToText } from './plainText'
import { reinsertNode } from '../timeline/ops'
import type { Timeline } from '../timeline/schema'
import { inboxNoteSchema, type InboxNote } from './schemas/inbox'
import type { Manifest } from './schemas/manifest'
import type { z } from 'zod'
import { codexEntrySchema } from './schemas/codexEntry'
import { ruleSchema } from './schemas/rule'
import { trashedNodeSchema, type TrashedNode } from './schemas/trashedNode'
import { parseFile, serialize } from './serialize'
import type { Env, ProjectIO, TrashEntry } from './types'

type Node = Manifest['manuscript'][number]

/** What the project layer hands to trash operations. */
export interface TrashHost {
  io: ProjectIO
  env: Env
  manifest: Manifest
  assertWritable(): void
  saveManifest(): Promise<void>
  /** Carries the known hash and invalid flag from one path to another after a move. */
  moveTracking(from: string, to: string): void
}

export const TRASH_DIR = '.storyworks/trash'
const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))

interface Found {
  node: Node
  parentId: string | null
  index: number
}

function find(nodes: Node[], id: string, parentId: string | null = null): Found | null {
  for (const [index, node] of nodes.entries()) {
    if (node.id === id) return { node, parentId, index }
    const inner = find(node.children, id, node.id)
    if (inner) return inner
  }
  return null
}

function removeNode(nodes: Node[], id: string): Node[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }))
}

function insertNode(nodes: Node[], parentId: string | null, index: number, node: Node): Node[] {
  if (parentId === null) {
    const at = Math.min(index, nodes.length)
    return [...nodes.slice(0, at), node, ...nodes.slice(at)]
  }
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, children: insertNode(n.children, null, index, node) }
      : { ...n, children: insertNode(n.children, parentId, index, node) },
  )
}

/** The node and its descendants, descendants first (so the node's own entry is last). */
function subtree(found: Found): Found[] {
  const below = found.node.children.flatMap((child, index) =>
    subtree({ node: child, parentId: found.node.id, index }),
  )
  return [...below, found]
}

export async function moveFile(host: TrashHost, from: string, to: string): Promise<void> {
  await host.io.mkdir(dirOf(to))
  await host.io.rename(from, to)
  host.moveTracking(from, to)
}

/** Best-effort undo of moves already done, newest first. */
export async function undoMoves(host: TrashHost, moves: [string, string][]): Promise<void> {
  for (const [from, to] of moves.reverse()) await moveFile(host, to, from).catch(() => {})
}

/**
 * Moves the item's file (and those of its descendants) into the trash, then saves the manifest.
 * Descendants get their own entries; restoring a container restores only the container.
 */
export async function deleteItemImpl(host: TrashHost, id: string): Promise<TrashEntry> {
  host.assertWritable()
  const { manifest, io } = host
  const found = find(manifest.manuscript, id)
  if (!found) throw new Error(`Cannot delete ${id}: not in the manuscript`)

  const deletedAt = new Date(host.env.now()).toISOString()
  const entries: TrashEntry[] = []
  const moves: [string, string][] = []
  try {
    for (const f of subtree(found)) {
      const { node } = f
      const original = node.path ?? ''
      const trashPath = `${TRASH_DIR}/${node.id}/${original.split('/').pop() ?? ''}`
      if (original && (await io.exists(original))) {
        await moveFile(host, original, trashPath)
        moves.push([original, trashPath])
      }
      entries.push({
        id: node.id,
        type: node.type,
        title: node.title,
        originalPath: original,
        trashPath,
        parentId: f.parentId,
        index: f.index,
        deletedAt,
        ...(node.routes?.length ? { routes: node.routes } : {}),
      })
    }
    const before = { manuscript: manifest.manuscript, trash: manifest.trash }
    manifest.manuscript = removeNode(manifest.manuscript, id)
    manifest.trash = [...manifest.trash, ...entries]
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
  return entries[entries.length - 1]
}

/** Puts the item back at its original parent and index (root if the parent is gone). */
export async function restoreItemImpl(host: TrashHost, id: string): Promise<void> {
  host.assertWritable()
  const { manifest, io } = host
  const entry = manifest.trash.find((t) => t.id === id)
  if (!entry) throw new Error(`Cannot restore ${id}: not in the trash`)
  if (entry.type === 'note')
    throw new Error(`Cannot restore ${id}: inbox notes are restored through the store`)
  if (entry.type === 'timeline')
    throw new Error(`Cannot restore ${id}: timelines are restored through the store`)
  if (entry.type === 'node')
    throw new Error(`Cannot restore ${id}: timeline events are restored through the store`)
  if (entry.type === 'rule')
    throw new Error(`Cannot restore ${id}: rules are restored through the store`)
  if (entry.type === 'entry')
    throw new Error(`Cannot restore ${id}: codex entries are restored through the store`)
  if (entry.originalPath && (await io.exists(entry.originalPath))) {
    throw new Error(`Cannot restore ${id}: ${entry.originalPath} already exists`)
  }

  const moves: [string, string][] = []
  try {
    if (entry.originalPath && (await io.exists(entry.trashPath))) {
      await moveFile(host, entry.trashPath, entry.originalPath)
      moves.push([entry.trashPath, entry.originalPath])
    }
    const parentId =
      entry.parentId !== null && find(manifest.manuscript, entry.parentId) ? entry.parentId : null
    const node: Node = {
      id: entry.id,
      type: entry.type,
      title: entry.title,
      ...(entry.originalPath ? { path: entry.originalPath } : {}),
      ...(entry.routes?.length ? { routes: entry.routes } : {}),
      children: [],
    }
    const before = { manuscript: manifest.manuscript, trash: manifest.trash }
    manifest.manuscript = insertNode(manifest.manuscript, parentId, entry.index, node)
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

const NOTE_TITLE_MAX = 60

/** Saves a deleted inbox note as a file in the trash and lists it; the caller removes it from the inbox. */
export async function trashNoteImpl(
  host: TrashHost,
  note: InboxNote,
  index: number,
): Promise<TrashEntry> {
  host.assertWritable()
  const { manifest, io } = host
  const trashPath = `${TRASH_DIR}/${note.id}/note.json`
  const entry: TrashEntry = {
    id: note.id,
    type: 'note',
    title:
      note.title || docToText(note.content).trim().replace(/\s+/g, ' ').slice(0, NOTE_TITLE_MAX),
    originalPath: '',
    trashPath,
    parentId: null,
    index,
    deletedAt: new Date(host.env.now()).toISOString(),
  }
  await io.mkdir(dirOf(trashPath))
  await io.writeTextAtomic(trashPath, serialize(inboxNoteSchema, note))
  const before = manifest.trash
  manifest.trash = [...before, entry]
  try {
    await host.saveManifest()
  } catch (e) {
    manifest.trash = before
    await io.remove(trashPath).catch(() => {})
    throw e
  }
  return entry
}

export async function readTrashedNoteImpl(
  host: TrashHost,
  id: string,
): Promise<{ note: InboxNote; index: number }> {
  const entry = host.manifest.trash.find((t) => t.id === id && t.type === 'note')
  if (!entry) throw new Error(`Cannot restore ${id}: not a note in the trash`)
  const text = await host.io.readText(entry.trashPath)
  if (text === null) throw new Error(`Cannot restore ${id}: ${entry.trashPath} is missing`)
  const r = parseFile(inboxNoteSchema, text, entry.trashPath)
  if (!r.ok) throw new Error(`Cannot restore ${id}: ${r.error.message}`)
  return { note: r.value, index: entry.index }
}

export async function dropTrashedNoteImpl(host: TrashHost, id: string): Promise<void> {
  host.assertWritable()
  const { manifest, io } = host
  const entry = manifest.trash.find((t) => t.id === id && t.type === 'note')
  if (!entry) return
  const before = manifest.trash
  manifest.trash = before.filter((t) => t !== entry)
  try {
    await host.saveManifest()
  } catch (e) {
    manifest.trash = before
    throw e
  }
  await io.remove(entry.trashPath).catch(() => {})
}

export type NodeRestoreErrorCode =
  | 'not-in-trash'
  | 'timeline-trashed'
  | 'timeline-gone'
  | 'file-missing'
  | 'file-invalid'
  | 'node-exists'
  | 'read-only'
  | 'unknown'

export class NodeRestoreError extends Error {
  constructor(
    readonly code: NodeRestoreErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'NodeRestoreError'
  }
}

/** Saves a deleted timeline node (with its edges) in the trash and lists it. The timeline edit is the caller's job. */
export async function trashNodeImpl(host: TrashHost, item: TrashedNode): Promise<TrashEntry> {
  host.assertWritable()
  const { manifest, io } = host
  const trashPath = `${TRASH_DIR}/${item.id}/node.json`
  const entry: TrashEntry = {
    id: item.id,
    type: 'node',
    title: item.node.title,
    originalPath: '',
    trashPath,
    parentId: item.timelineId,
    index: item.index,
    deletedAt: new Date(host.env.now()).toISOString(),
  }
  await io.mkdir(dirOf(trashPath))
  await io.writeTextAtomic(trashPath, serialize(trashedNodeSchema, item))
  const before = manifest.trash
  manifest.trash = [...before, entry]
  try {
    await host.saveManifest()
  } catch (e) {
    manifest.trash = before
    await io.remove(trashPath).catch(() => {})
    throw e
  }
  return entry
}

/**
 * Computes the timeline with the trashed node put back (same id, old position, edges that still
 * fit). Writes nothing: the caller saves the timeline, then calls dropTrashedNodeImpl.
 */
export async function restoreNodeImpl(
  host: TrashHost,
  id: string,
  timelines: ReadonlyMap<string, Timeline>,
): Promise<{ timeline: Timeline; skipped: Timeline['edges'] }> {
  host.assertWritable()
  const { manifest, io } = host
  const entry = manifest.trash.find((t) => t.id === id && t.type === 'node')
  if (!entry) throw new NodeRestoreError('not-in-trash', `Cannot restore ${id}: not in the trash`)
  const text = await io.readText(entry.trashPath)
  if (text === null)
    throw new NodeRestoreError('file-missing', `Cannot restore ${id}: ${entry.trashPath} is missing`)
  const r = parseFile(trashedNodeSchema, text, entry.trashPath)
  if (!r.ok) throw new NodeRestoreError('file-invalid', `Cannot restore ${id}: ${r.error.message}`)
  const item = r.value
  if (manifest.trash.some((t) => t.type === 'timeline' && t.id === item.timelineId))
    throw new NodeRestoreError('timeline-trashed', `Cannot restore ${id}: its timeline is in the trash`)
  const timeline = timelines.get(item.timelineId)
  if (!timeline)
    throw new NodeRestoreError('timeline-gone', `Cannot restore ${id}: its timeline is not available`)
  const out = reinsertNode(timeline, item.node, item.edges, item.index)
  if (!out.ok) throw new NodeRestoreError('node-exists', `Cannot restore ${id}: already in the timeline`)
  return out.value
}

export async function dropTrashedNodeImpl(host: TrashHost, id: string): Promise<void> {
  host.assertWritable()
  const { manifest, io } = host
  const entry = manifest.trash.find((t) => t.id === id && t.type === 'node')
  if (!entry) return
  const before = manifest.trash
  manifest.trash = before.filter((t) => t !== entry)
  try {
    await host.saveManifest()
  } catch (e) {
    manifest.trash = before
    throw e
  }
  await io.remove(entry.trashPath).catch(() => {})
}

export type RuleRestoreErrorCode =
  | 'not-in-trash'
  | 'file-missing'
  | 'file-invalid'
  | 'path-exists'
  | 'read-only'
  | 'unknown'

export class RuleRestoreError extends Error {
  constructor(
    readonly code: RuleRestoreErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RuleRestoreError'
  }
}

export class EntryRestoreError extends Error {
  constructor(
    readonly code: RuleRestoreErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'EntryRestoreError'
  }
}

/** A manifest list that holds one kind of whole-file item (rules, codex entries). */
interface ListedKind {
  list: 'rules' | 'codexEntries'
  type: 'rule' | 'entry'
  label: string
  schema: z.ZodType<{ id: string }>
  error: new (code: RuleRestoreErrorCode, message: string) => Error
}

const RULE_KIND: ListedKind = {
  list: 'rules',
  type: 'rule',
  label: 'rule',
  schema: ruleSchema,
  error: RuleRestoreError,
}
const ENTRY_KIND: ListedKind = {
  list: 'codexEntries',
  type: 'entry',
  label: 'entry',
  schema: codexEntrySchema,
  error: EntryRestoreError,
}

/** Moves the file to the trash, unlists it and adds a trash entry. Any file moves, even an invalid one. */
async function trashListed(host: TrashHost, k: ListedKind, id: string, title: string): Promise<TrashEntry> {
  host.assertWritable()
  const { manifest, io } = host
  const index = manifest[k.list].findIndex((r) => r.id === id)
  if (index < 0) throw new Error(`Cannot delete ${id}: not a listed ${k.label}`)
  const ref = manifest[k.list][index]
  const trashPath = `${TRASH_DIR}/${id}/${ref.path.split('/').pop() ?? ''}`
  const moves: [string, string][] = []
  try {
    if (await io.exists(ref.path)) {
      await moveFile(host, ref.path, trashPath)
      moves.push([ref.path, trashPath])
    }
    const entry: TrashEntry = {
      id,
      type: k.type,
      title,
      originalPath: ref.path,
      trashPath,
      parentId: null,
      index,
      deletedAt: new Date(host.env.now()).toISOString(),
    }
    const before = { [k.list]: manifest[k.list], trash: manifest.trash }
    manifest[k.list] = manifest[k.list].filter((r) => r.id !== id)
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

/** Puts the item back (same id, same position). The trashed file must validate; otherwise nothing changes. */
async function restoreListed(host: TrashHost, k: ListedKind, id: string): Promise<void> {
  const fail = (code: RuleRestoreErrorCode, message: string) => new k.error(code, message)
  try {
    host.assertWritable()
  } catch (e) {
    throw fail('read-only', e instanceof Error ? e.message : String(e))
  }
  const { manifest, io } = host
  const entry = manifest.trash.find((t) => t.id === id && t.type === k.type)
  if (!entry) throw fail('not-in-trash', `Cannot restore ${id}: not a ${k.label} in the trash`)
  const text = await io.readText(entry.trashPath)
  if (text === null) throw fail('file-missing', `Cannot restore ${id}: ${entry.trashPath} is missing`)
  const r = parseFile(k.schema, text, entry.trashPath)
  if (!r.ok) throw fail('file-invalid', `Cannot restore ${id}: ${r.error.message}`)
  if (r.value.id !== id)
    throw fail('file-invalid', `Cannot restore ${id}: the file holds ${k.label} ${r.value.id}`)
  if (await io.exists(entry.originalPath))
    throw fail('path-exists', `Cannot restore ${id}: ${entry.originalPath} already exists`)
  const moves: [string, string][] = []
  try {
    await moveFile(host, entry.trashPath, entry.originalPath)
    moves.push([entry.trashPath, entry.originalPath])
    const before = { [k.list]: manifest[k.list], trash: manifest.trash }
    const list = [...manifest[k.list]]
    list.splice(Math.min(entry.index, list.length), 0, {
      id,
      path: entry.originalPath,
      title: entry.title,
    })
    manifest[k.list] = list
    manifest.trash = manifest.trash.filter((t) => t !== entry)
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

export const trashRuleImpl = (host: TrashHost, id: string, title: string) =>
  trashListed(host, RULE_KIND, id, title)
export const restoreRuleImpl = (host: TrashHost, id: string) => restoreListed(host, RULE_KIND, id)
export const trashEntryImpl = (host: TrashHost, id: string, title: string) =>
  trashListed(host, ENTRY_KIND, id, title)
export const restoreEntryImpl = (host: TrashHost, id: string) => restoreListed(host, ENTRY_KIND, id)
