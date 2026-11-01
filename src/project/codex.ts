import type { Timeline } from '../timeline/schema'
import { defaultNames } from './defaultNames'
import { docToText } from './plainText'
import { loadList } from './rules'
import { codexEntrySchema, type CodexEntry } from './schemas/codexEntry'
import { CODEX_TYPE_VERSION, codexTypeSchema, type CodexType } from './schemas/codexType'
import type { Env, OpenProject } from './types'

export const codexEntryPath = (id: string) => `codex/${id}.json`
export const codexTypePath = (id: string) => `codex/types/${id}.json`

/** Character first: the POV picker lists it first. */
export const DEFAULT_CODEX_TYPES: readonly { name: string; color: string; icon: string }[] = [
  { name: 'Character', color: '#8e4a9e', icon: 'person' },
  { name: 'Item', color: '#b45f9a', icon: 'inventory_2' },
  { name: 'Place', color: '#7a5aa8', icon: 'place' },
  { name: 'Country', color: '#a0489a', icon: 'flag' },
  { name: 'Town', color: '#9a6bb0', icon: 'location_city' },
  { name: 'Building', color: '#85548f', icon: 'home_work' },
]

export const loadCodexEntries = (project: OpenProject) =>
  loadList(project, project.manifest.codexEntries, codexEntrySchema)
export const loadCodexTypes = (project: OpenProject) =>
  loadList(project, project.manifest.codexTypes, codexTypeSchema)

// ---- search and filter ----

export interface EntryFilter {
  typeId?: string | null
  /** An entry must carry every listed tag. */
  tags?: string[]
  /** Case-insensitive; matches name, aliases, tags and the plain text of the notes. */
  query?: string
}

export function filterEntries(entries: readonly CodexEntry[], f: EntryFilter): CodexEntry[] {
  const q = (f.query ?? '').trim().toLowerCase()
  const tags = f.tags ?? []
  return entries.filter((e) => {
    if (f.typeId && e.typeId !== f.typeId) return false
    if (!tags.every((t) => e.tags.includes(t))) return false
    if (!q) return true
    return (
      e.name.toLowerCase().includes(q) ||
      e.aliases.some((a) => a.toLowerCase().includes(q)) ||
      e.tags.some((t) => t.toLowerCase().includes(q)) ||
      docToText(e.notes).toLowerCase().includes(q)
    )
  })
}

// ---- types ----

export type DeleteTypePlan =
  | { ok: true; reassign: string[]; targetId: string | null }
  | { ok: false; reason: 'unknown-type' | 'last-type' | 'target-required' | 'bad-target' }

/** What deleting a type involves: which entries move where. Pure; deletes nothing. */
export function deleteTypePlan(
  typeIds: readonly string[],
  entries: readonly Pick<CodexEntry, 'id' | 'typeId'>[],
  typeId: string,
  targetId?: string | null,
): DeleteTypePlan {
  if (!typeIds.includes(typeId)) return { ok: false, reason: 'unknown-type' }
  if (typeIds.length <= 1) return { ok: false, reason: 'last-type' }
  const reassign = entries.filter((e) => e.typeId === typeId).map((e) => e.id)
  if (reassign.length === 0) return { ok: true, reassign, targetId: null }
  if (!targetId) return { ok: false, reason: 'target-required' }
  if (targetId === typeId || !typeIds.includes(targetId)) return { ok: false, reason: 'bad-target' }
  return { ok: true, reassign, targetId }
}

export function reassignEntries(
  entries: readonly CodexEntry[],
  from: string,
  to: string,
): CodexEntry[] {
  return entries.map((e) => (e.typeId === from ? { ...e, typeId: to } : e))
}

/**
 * First-open defaults: six starter types, only when the book has no types and no entries
 * (so deleting them all on a book with entries does not bring them back). Idempotent; does
 * nothing when read-only. Saves right away.
 */
export async function seedCodexTypes(project: OpenProject, env: Env): Promise<void> {
  if (project.readOnly) return
  const { manifest } = project
  if (manifest.codexTypes.length > 0 || manifest.codexEntries.length > 0) return
  const written: string[] = []
  const before = manifest.codexTypes
  try {
    const refs = []
    const names = defaultNames(manifest.language).codexTypes
    for (const [i, { color, icon }] of DEFAULT_CODEX_TYPES.entries()) {
      const name = names[i]
      const type: CodexType = { version: CODEX_TYPE_VERSION, id: env.newId(), name, color, icon }
      const path = codexTypePath(type.id)
      await project.saveItem(path, codexTypeSchema, type)
      written.push(path)
      refs.push({ id: type.id, path, title: name })
    }
    manifest.codexTypes = refs
    await project.saveManifest()
  } catch (e) {
    manifest.codexTypes = before
    await Promise.all(written.map((p) => project.io.remove(p).catch(() => {})))
    throw e
  }
}

// ---- links ----

export interface EntryUsage {
  timelineId: string
  timelineName: string
  nodeId: string
  nodeTitle: string
}

/** Nodes (in any timeline) that list the entry in `codexIds`. */
export function nodesUsingEntry(timelines: readonly Timeline[], entryId: string): EntryUsage[] {
  return timelines.flatMap((t) =>
    t.nodes
      .filter((n) => n.codexIds.includes(entryId))
      .map((n) => ({ timelineId: t.id, timelineName: t.name, nodeId: n.id, nodeTitle: n.title })),
  )
}

export interface BrokenCodexLink {
  timelineId: string
  nodeId: string
  entryId: string
}

/** Node codex ids that point at no listed entry (deleted, trashed or never existed). */
export function brokenCodexLinks(
  timelines: readonly Timeline[],
  liveEntryIds: ReadonlySet<string>,
): BrokenCodexLink[] {
  return timelines.flatMap((t) =>
    t.nodes.flatMap((n) =>
      n.codexIds
        .filter((id) => !liveEntryIds.has(id))
        .map((entryId) => ({ timelineId: t.id, nodeId: n.id, entryId })),
    ),
  )
}

/** Entries that list the rule in `ruleIds` (back-link for the rule page). */
export const entriesUsingRule = (entries: readonly CodexEntry[], ruleId: string): CodexEntry[] =>
  entries.filter((e) => e.ruleIds.includes(ruleId))

/** Rule ids on entries that point at no listed rule. */
export function brokenEntryRuleLinks(
  entries: readonly CodexEntry[],
  liveRuleIds: ReadonlySet<string>,
): { entryId: string; ruleId: string }[] {
  return entries.flatMap((e) =>
    e.ruleIds.filter((id) => !liveRuleIds.has(id)).map((ruleId) => ({ entryId: e.id, ruleId })),
  )
}
