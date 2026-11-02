import type { Timeline } from '../timeline/schema'
import { defaultNames } from './defaultNames'
import { loadList } from './rules'
import { groupSchema, type Group } from './schemas/group'
import { relationshipSchema, type Relationship } from './schemas/relationship'
import {
  RELATION_TYPE_VERSION,
  relationTypeSchema,
  type RelationType,
} from './schemas/relationType'
import type { Env, OpenProject } from './types'

export const relationTypePath = (id: string) => `relation-types/${id}.json`
export const relationshipPath = (id: string) => `relationships/${id}.json`
export const groupPath = (id: string) => `groups/${id}.json`
export const RELATION_LAYOUT_PATH = 'relationships/layout.json'

/** Names and reverse labels come from defaultNames (same order). */
export const DEFAULT_RELATION_TYPES: readonly { color: string }[] = [
  { color: '#3d9a6b' },
  { color: '#c0443c' },
  { color: '#4a7fc1' },
  { color: '#2f9aa8' },
  { color: '#c25a8f' },
  { color: '#8a6d3b' },
  { color: '#7a5aa8' },
]

export const loadRelationTypes = (project: OpenProject) =>
  loadList(project, project.manifest.relationTypes, relationTypeSchema)
export const loadRelationships = (project: OpenProject) =>
  loadList(project, project.manifest.relationships, relationshipSchema)
export const loadGroups = (project: OpenProject) =>
  loadList(project, project.manifest.groups, groupSchema)

// ---- validation ----

export type NewRelationshipCheck =
  | { ok: true }
  | { ok: false; reason: 'self' | 'duplicate' | 'unknown-type' | 'unknown-entry' }

/** Rejects self links, unknown ends or type, and an exact duplicate (same from, to, type). `id` = the one being edited. */
export function validateNewRelationship(
  existing: readonly Pick<Relationship, 'id' | 'fromId' | 'toId' | 'typeId'>[],
  candidate: Pick<Relationship, 'fromId' | 'toId' | 'typeId'> & { id?: string },
  known: { entryIds: ReadonlySet<string>; typeIds: ReadonlySet<string> },
): NewRelationshipCheck {
  if (candidate.fromId === candidate.toId) return { ok: false, reason: 'self' }
  if (!known.entryIds.has(candidate.fromId) || !known.entryIds.has(candidate.toId))
    return { ok: false, reason: 'unknown-entry' }
  if (!known.typeIds.has(candidate.typeId)) return { ok: false, reason: 'unknown-type' }
  const dup = existing.some(
    (r) =>
      r.id !== candidate.id &&
      r.fromId === candidate.fromId &&
      r.toId === candidate.toId &&
      r.typeId === candidate.typeId,
  )
  return dup ? { ok: false, reason: 'duplicate' } : { ok: true }
}

// ---- types ----

export type DeleteRelationTypePlan =
  | { ok: true; reassign: string[]; targetId: string | null }
  | { ok: false; reason: 'unknown-type' | 'target-required' | 'bad-target' }

/** What deleting a type involves: which relationships move where. The last type may go if unused. Pure. */
export function deleteRelationTypePlan(
  typeIds: readonly string[],
  relationships: readonly Pick<Relationship, 'id' | 'typeId'>[],
  typeId: string,
  targetId?: string | null,
): DeleteRelationTypePlan {
  if (!typeIds.includes(typeId)) return { ok: false, reason: 'unknown-type' }
  const reassign = relationships.filter((r) => r.typeId === typeId).map((r) => r.id)
  if (reassign.length === 0) return { ok: true, reassign, targetId: null }
  if (!targetId) return { ok: false, reason: 'target-required' }
  if (targetId === typeId || !typeIds.includes(targetId)) return { ok: false, reason: 'bad-target' }
  return { ok: true, reassign, targetId }
}

export function reassignRelationships(
  relationships: readonly Relationship[],
  from: string,
  to: string,
): Relationship[] {
  return relationships.map((r) => (r.typeId === from ? { ...r, typeId: to } : r))
}

/**
 * First-open defaults: seven starter types, only when the book has no types and no
 * relationships. Idempotent; does nothing when read-only. Saves right away.
 */
export async function seedRelationTypes(project: OpenProject, env: Env): Promise<void> {
  if (project.readOnly) return
  const { manifest } = project
  if (manifest.relationTypes.length > 0 || manifest.relationships.length > 0) return
  const written: string[] = []
  const before = manifest.relationTypes
  try {
    const refs = []
    const names = defaultNames(manifest.language).relationTypes
    for (const [i, { color }] of DEFAULT_RELATION_TYPES.entries()) {
      const { name, reverseLabel } = names[i]
      const type: RelationType = {
        version: RELATION_TYPE_VERSION,
        id: env.newId(),
        name,
        reverseLabel,
        color,
      }
      const path = relationTypePath(type.id)
      await project.saveItem(path, relationTypeSchema, type)
      written.push(path)
      refs.push({ id: type.id, path, title: name })
    }
    manifest.relationTypes = refs
    await project.saveManifest()
  } catch (e) {
    manifest.relationTypes = before
    await Promise.all(written.map((p) => project.io.remove(p).catch(() => {})))
    throw e
  }
}

// ---- per entry ----

export interface RelationRow {
  relationship: Relationship
  otherId: string
  direction: 'out' | 'in'
  label: string
}

/** Outgoing and incoming relationships of an entry, in list order. Incoming rows use the reverse label (name when none). */
export function relationsOf(
  entryId: string,
  relationships: readonly Relationship[],
  types: readonly Pick<RelationType, 'id' | 'name' | 'reverseLabel'>[],
): RelationRow[] {
  const byId = new Map(types.map((t) => [t.id, t]))
  const rows: RelationRow[] = []
  for (const relationship of relationships) {
    const out = relationship.fromId === entryId
    if (!out && relationship.toId !== entryId) continue
    const type = byId.get(relationship.typeId)
    rows.push({
      relationship,
      otherId: out ? relationship.toId : relationship.fromId,
      direction: out ? 'out' : 'in',
      label: out ? (type?.name ?? '') : type?.reverseLabel || (type?.name ?? ''),
    })
  }
  return rows
}

/** Relationship ids with an endpoint that is not a live entry (trashed or missing). */
export const brokenRelationships = (
  relationships: readonly Relationship[],
  liveEntryIds: ReadonlySet<string>,
): string[] =>
  relationships
    .filter((r) => !liveEntryIds.has(r.fromId) || !liveEntryIds.has(r.toId))
    .map((r) => r.id)

export function brokenMemberships(
  groups: readonly Group[],
  liveEntryIds: ReadonlySet<string>,
): { groupId: string; entryId: string }[] {
  return groups.flatMap((g) =>
    g.memberIds.filter((id) => !liveEntryIds.has(id)).map((entryId) => ({ groupId: g.id, entryId })),
  )
}

export const groupsOfEntry = (groups: readonly Group[], entryId: string): Group[] =>
  groups.filter((g) => g.memberIds.includes(entryId))

export const addMember = (group: Group, entryId: string): Group =>
  group.memberIds.includes(entryId) ? group : { ...group, memberIds: [...group.memberIds, entryId] }

export const removeMember = (group: Group, entryId: string): Group =>
  group.memberIds.includes(entryId)
    ? { ...group, memberIds: group.memberIds.filter((id) => id !== entryId) }
    : group

// ---- node links (stored on the relationship as `nodeRef`) ----

export const relationshipsOnNode = (
  relationships: readonly Relationship[],
  timelineId: string,
  nodeId: string,
): Relationship[] =>
  relationships.filter((r) => r.nodeRef?.timelineId === timelineId && r.nodeRef.nodeId === nodeId)

/** Relationship ids whose node link points at a missing timeline or node. */
export function brokenNodeRefs(
  relationships: readonly Relationship[],
  timelines: readonly Timeline[],
): string[] {
  const nodes = new Map(timelines.map((t) => [t.id, new Set(t.nodes.map((n) => n.id))]))
  return relationships
    .filter((r) => r.nodeRef && !nodes.get(r.nodeRef.timelineId)?.has(r.nodeRef.nodeId))
    .map((r) => r.id)
}
