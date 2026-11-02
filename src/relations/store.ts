import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { newId } from '../project/ids'
import {
  addMember as withMember,
  brokenMemberships,
  brokenNodeRefs,
  brokenRelationships,
  deleteRelationTypePlan,
  groupPath,
  groupsOfEntry as groupsContaining,
  loadGroups,
  loadRelationships,
  loadRelationTypes,
  reassignRelationships,
  relationshipPath,
  relationshipsOnNode as onNode,
  relationsOf,
  relationTypePath,
  RELATION_LAYOUT_PATH,
  removeMember as withoutMember,
  validateNewRelationship,
  type DeleteRelationTypePlan,
  type NewRelationshipCheck,
  type RelationRow,
} from '../project/relations'
import type { ItemStatus } from '../project/rules'
import { GROUP_VERSION, groupSchema, type Group } from '../project/schemas/group'
import {
  RELATION_LAYOUT_VERSION,
  relationLayoutSchema,
  type RelationLayout,
} from '../project/schemas/relationLayout'
import {
  RELATIONSHIP_VERSION,
  relationshipSchema,
  type Relationship,
} from '../project/schemas/relationship'
import {
  RELATION_TYPE_VERSION,
  relationTypeSchema,
  type RelationType,
} from '../project/schemas/relationType'
import { parseFile } from '../project/serialize'
import { useProjectStore } from '../project/store'
import type { FileError } from '../project/types'
import { useCodexStore } from '../codex/store'
import { useTimelinesStore } from '../timeline/store'

/** One listed file, in manifest order. `status` is not 'ok' for files the UI shows as "invalid file" / "missing". */
export interface ListEntry {
  id: string
  path: string
  title: string
  status: ItemStatus
  error?: FileError
}

export type Position = { x: number; y: number }
export type TypePatch = Partial<Pick<RelationType, 'name' | 'reverseLabel' | 'color'>>
export type GroupPatch = Partial<Pick<Group, 'name' | 'color'>>
export type RelationshipPatch = Partial<
  Pick<Relationship, 'fromId' | 'toId' | 'typeId' | 'note' | 'nodeRef'>
>
export type NewRelationship = Pick<Relationship, 'fromId' | 'toId' | 'typeId'> &
  Partial<Pick<Relationship, 'note' | 'nodeRef'>>

type Rejection = Extract<NewRelationshipCheck, { ok: false }>['reason']
export type RelationshipRejection = Rejection | 'read-only' | 'unknown-node'
export type CreateRelationshipOutcome =
  { ok: true; id: string } | { ok: false; reason: RelationshipRejection }
export type RelationshipOutcome =
  { ok: true } | { ok: false; reason: RelationshipRejection | 'unknown-relationship' }
export type TypeOutcome =
  { ok: true } | { ok: false; reason: 'read-only' | 'unknown-type' | 'empty-name' }
export type GroupOutcome =
  { ok: true } | { ok: false; reason: 'read-only' | 'unknown-group' | 'empty-name' }
export type MemberOutcome =
  { ok: true } | { ok: false; reason: 'read-only' | 'unknown-group' | 'unknown-entry' }
export type DeleteTypeOutcome =
  | { ok: true; moved: number }
  | {
      ok: false
      reason: 'read-only' | Extract<DeleteRelationTypePlan, { ok: false }>['reason'] | 'unknown'
    }

type Kind = 'type' | 'relationship' | 'group'
type Docs = Map<string, { id: string }>

const DEFAULT_COLOR = '#8e4a9e'
const EMPTY_DOC = () => ({ type: 'doc', content: [] })
const clean = (s: string) => s.trim()

export const useRelationsStore = defineStore('relations', () => {
  const projectStore = useProjectStore()
  const codex = useCodexStore()
  const timelines = useTimelinesStore()

  const typeDocs = shallowRef(new Map<string, RelationType>())
  const relationshipDocs = shallowRef(new Map<string, Relationship>())
  const groupDocs = shallowRef(new Map<string, Group>())
  const typeList = shallowRef<ListEntry[]>([])
  const relationshipList = shallowRef<ListEntry[]>([])
  const groupList = shallowRef<ListEntry[]>([])
  const layoutDoc = shallowRef<RelationLayout | null>(null)
  const layoutStatus = ref<'none' | ItemStatus>('none')
  const layoutError = ref<FileError | null>(null)
  const statuses = new Map<string, { status: ItemStatus; error?: FileError }>()
  const seen = new Map<string, number>()

  const readOnly = computed(() => projectStore.readOnly)
  /** Readable docs in manifest order. */
  const types = computed(() => [...typeDocs.value.values()])
  const relationships = computed(() => [...relationshipDocs.value.values()])
  const groups = computed(() => [...groupDocs.value.values()])
  /** Saved graph positions by entry id (empty when none or the file is invalid). */
  const layout = computed<Record<string, Position>>(() => layoutDoc.value?.positions ?? {})

  /** Ids of listed codex entries (trashed or deleted ones are not listed). */
  const liveEntryIds = computed(() => new Set(codex.entryList.map((e) => e.id)))
  /** Relationships with an endpoint that is not a live entry. */
  const brokenRelationshipIds = computed(() =>
    brokenRelationships(relationships.value, liveEntryIds.value),
  )
  /** Relationships whose node link points at a missing node or timeline (unreadable timelines are not judged). */
  const brokenNodeRefIds = computed(() => {
    const unreadable = new Set(timelines.entries.filter((e) => e.status !== 'ok').map((e) => e.id))
    return brokenNodeRefs(
      relationships.value.filter((r) => !(r.nodeRef && unreadable.has(r.nodeRef.timelineId))),
      timelines.loadedTimelines,
    )
  })
  /** Group members that are not live entries. */
  const brokenMembershipsList = computed(() =>
    brokenMemberships(groups.value, liveEntryIds.value),
  )

  const docsOf = (kind: Kind): Docs =>
    kind === 'type' ? typeDocs.value : kind === 'relationship' ? relationshipDocs.value : groupDocs.value
  const setDocs = (kind: Kind, docs: Docs): void => {
    if (kind === 'type') typeDocs.value = docs as Map<string, RelationType>
    else if (kind === 'relationship') relationshipDocs.value = docs as Map<string, Relationship>
    else groupDocs.value = docs as Map<string, Group>
  }
  const schemaOf = (kind: Kind) =>
    kind === 'type' ? relationTypeSchema : kind === 'relationship' ? relationshipSchema : groupSchema
  const refsOf = (kind: Kind) => {
    const m = projectStore.project?.manifest
    return (kind === 'type' ? m?.relationTypes : kind === 'relationship' ? m?.relationships : m?.groups) ?? []
  }

  // ---- loading ----

  function rebuildLists(): void {
    const m = projectStore.project?.manifest
    const item = (r: { id: string; path: string; title?: string }): ListEntry => {
      const st = statuses.get(r.id) ?? { status: 'ok' as const }
      return {
        id: r.id,
        path: r.path,
        title: r.title ?? '',
        status: st.status,
        ...(st.error ? { error: st.error } : {}),
      }
    }
    typeList.value = (m?.relationTypes ?? []).map(item)
    relationshipList.value = (m?.relationships ?? []).map(item)
    groupList.value = (m?.groups ?? []).map(item)
  }

  function reseedVersions(): void {
    seen.clear()
    for (const e of [...typeList.value, ...relationshipList.value, ...groupList.value])
      seen.set(e.path, projectStore.itemVersion(e.path))
    const ref = projectStore.project?.manifest.relationLayout
    if (ref) seen.set(ref.path, projectStore.itemVersion(ref.path))
  }

  function setLayout(
    doc: RelationLayout | null,
    status: 'none' | ItemStatus,
    error: FileError | null = null,
  ): void {
    layoutDoc.value = doc
    layoutStatus.value = status
    layoutError.value = error
  }

  async function readLayout(): Promise<void> {
    const p = projectStore.project
    const ref = p?.manifest.relationLayout
    if (!p || !ref) return setLayout(null, 'none')
    const text = await p.io.readText(ref.path)
    if (text === null) return setLayout(null, 'missing')
    const r = parseFile(relationLayoutSchema, text, ref.path)
    if (r.ok) setLayout(r.value, 'ok')
    else setLayout(null, 'invalid', r.error)
  }

  /** Reads everything again (after open, or after project.json was reloaded). */
  async function load(): Promise<void> {
    const p = projectStore.project
    if (!p) return reset()
    const [t, r, g] = await Promise.all([loadRelationTypes(p), loadRelationships(p), loadGroups(p)])
    typeDocs.value = t.items
    relationshipDocs.value = r.items
    groupDocs.value = g.items
    statuses.clear()
    for (const l of [t, r, g])
      for (const [id, status] of l.status) statuses.set(id, { status, error: l.errors.get(id) })
    rebuildLists()
    await readLayout()
    reseedVersions()
  }

  function reset(): void {
    typeDocs.value = new Map()
    relationshipDocs.value = new Map()
    groupDocs.value = new Map()
    typeList.value = []
    relationshipList.value = []
    groupList.value = []
    setLayout(null, 'none')
    statuses.clear()
    seen.clear()
  }

  async function rereadOne(kind: Kind, id: string, path: string): Promise<void> {
    const p = projectStore.project
    if (!p) return
    const text = await p.io.readText(path)
    const r = text === null ? null : parseFile<{ id: string }>(schemaOf(kind), text, path)
    const docs: Docs = new Map(docsOf(kind))
    if (r?.ok && r.value.id === id) {
      docs.set(id, r.value)
      statuses.set(id, { status: 'ok' })
    } else {
      docs.delete(id)
      statuses.set(
        id,
        r
          ? {
              status: 'invalid',
              error: r.ok
                ? { file: path, field: 'id', message: 'id does not match project.json' }
                : r.error,
            }
          : { status: 'missing' },
      )
    }
    // keep manifest order
    const ordered: Docs = new Map(
      refsOf(kind).flatMap((ref) => (docs.has(ref.id) ? [[ref.id, docs.get(ref.id)!] as const] : [])),
    )
    setDocs(kind, ordered)
    rebuildLists()
  }

  // Files changed on disk (the project store reloads them and bumps their version).
  watch(
    () => [
      ...typeList.value.map((e) => ['type', e.id, e.path, projectStore.itemVersion(e.path)] as const),
      ...relationshipList.value.map(
        (e) => ['relationship', e.id, e.path, projectStore.itemVersion(e.path)] as const,
      ),
      ...groupList.value.map((e) => ['group', e.id, e.path, projectStore.itemVersion(e.path)] as const),
      ...(projectStore.project?.manifest.relationLayout
        ? [
            [
              'layout',
              '',
              projectStore.project.manifest.relationLayout.path,
              projectStore.itemVersion(projectStore.project.manifest.relationLayout.path),
            ] as const,
          ]
        : []),
    ],
    async (now) => {
      for (const [kind, id, path, version] of now) {
        if (seen.get(path) === version) continue
        seen.set(path, version)
        if (kind === 'layout') await readLayout()
        else await rereadOne(kind, id, path)
      }
    },
  )

  /** Files written by this store are known; the watcher must not read them back. */
  const markSeen = (path: string) => seen.set(path, projectStore.itemVersion(path))

  // ---- relation types ----

  /** New type at the end of the list. null = refused (read-only, empty name). */
  async function createType(
    name: string,
    o: { reverseLabel?: string; color?: string } = {},
  ): Promise<string | null> {
    const p = projectStore.project
    const n = clean(name)
    if (!p || p.readOnly || !n) return null
    const type: RelationType = {
      version: RELATION_TYPE_VERSION,
      id: newId(),
      name: n,
      reverseLabel: clean(o.reverseLabel ?? ''),
      color: o.color ?? DEFAULT_COLOR,
    }
    const path = relationTypePath(type.id)
    await p.saveItem(path, relationTypeSchema, type)
    statuses.set(type.id, { status: 'ok' })
    typeDocs.value = new Map(typeDocs.value).set(type.id, type)
    projectStore.setRelationRefs({
      relationTypes: [...p.manifest.relationTypes, { id: type.id, path, title: n }],
    })
    rebuildLists()
    markSeen(path)
    return type.id
  }

  /** Id of the type with that name (case-insensitive), or a new one. null = refused. */
  async function findOrCreateTypeByName(name: string): Promise<string | null> {
    const n = clean(name)
    if (!n) return null
    const key = n.toLowerCase()
    const found = types.value.find((t) => t.name.toLowerCase() === key)
    return found ? found.id : createType(n)
  }

  function updateType(id: string, patch: TypePatch): TypeOutcome {
    const p = projectStore.project
    const type = typeDocs.value.get(id)
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!type) return { ok: false, reason: 'unknown-type' }
    const name = patch.name === undefined ? type.name : clean(patch.name)
    if (!name) return { ok: false, reason: 'empty-name' }
    const next: RelationType = {
      ...type,
      ...patch,
      name,
      reverseLabel: patch.reverseLabel === undefined ? type.reverseLabel : clean(patch.reverseLabel),
    }
    const path = typeList.value.find((e) => e.id === id)?.path
    if (!path || !projectStore.updateItem(path, relationTypeSchema, next))
      return { ok: false, reason: 'read-only' }
    typeDocs.value = new Map(typeDocs.value).set(id, next)
    if (name !== type.name)
      projectStore.setRelationRefs({
        relationTypes: p.manifest.relationTypes.map((r) => (r.id === id ? { ...r, title: name } : r)),
      })
    rebuildLists()
    return { ok: true }
  }

  /** What deleting would do (for the confirm dialog): relationships to move, or why it is refused. */
  const planDeleteType = (id: string, targetId?: string | null): DeleteRelationTypePlan =>
    deleteRelationTypePlan(
      types.value.map((t) => t.id),
      relationships.value,
      id,
      targetId,
    )

  /** Moves the type's relationships to `targetId` (required when it has any), then removes the type file. */
  async function deleteType(id: string, targetId?: string | null): Promise<DeleteTypeOutcome> {
    const p = projectStore.project
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    const plan = planDeleteType(id, targetId)
    if (!plan.ok) return plan
    const path = typeList.value.find((e) => e.id === id)?.path
    if (!path) return { ok: false, reason: 'unknown-type' }
    if (plan.targetId) {
      const moved = reassignRelationships(relationships.value, id, plan.targetId).filter((r) =>
        plan.reassign.includes(r.id),
      )
      if (!moved.every(commitRelationship)) return { ok: false, reason: 'unknown' }
    }
    const next = new Map(typeDocs.value)
    next.delete(id)
    typeDocs.value = next
    statuses.delete(id)
    projectStore.setRelationRefs({
      relationTypes: p.manifest.relationTypes.filter((r) => r.id !== id),
    })
    rebuildLists()
    try {
      await projectStore.flush() // relationships and the manifest are saved before the file goes
      await projectStore.removeUnlistedFile(path)
    } catch (e) {
      console.error('Could not remove the relation type file', e)
      return { ok: false, reason: 'unknown' }
    }
    return { ok: true, moved: plan.reassign.length }
  }

  // ---- relationships ----

  /** Outgoing and incoming rows of an entry (incoming ones use the reverse label). */
  const relationsFor = (entryId: string): RelationRow[] =>
    relationsOf(entryId, relationships.value, types.value)
  /** Relationships whose node link points at this node. */
  const relationshipsOnNode = (timelineId: string, nodeId: string): Relationship[] =>
    onNode(relationships.value, timelineId, nodeId)

  function commitRelationship(next: Relationship): boolean {
    const path = relationshipList.value.find((e) => e.id === next.id)?.path
    if (!path || !projectStore.updateItem(path, relationshipSchema, next)) return false
    relationshipDocs.value = new Map(relationshipDocs.value).set(next.id, next)
    return true
  }

  const nodeExists = (ref: NonNullable<Relationship['nodeRef']>) =>
    !!timelines.loadedTimelines
      .find((t) => t.id === ref.timelineId)
      ?.nodes.some((n) => n.id === ref.nodeId)

  const knownIds = () => ({
    entryIds: new Set(codex.entries.map((e) => e.id)),
    typeIds: new Set(types.value.map((t) => t.id)),
  })

  /** New relationship at the end of the list. Refuses self links, duplicates and unknown ends, type or node. */
  async function createRelationship(o: NewRelationship): Promise<CreateRelationshipOutcome> {
    const p = projectStore.project
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    const check = validateNewRelationship(relationships.value, o, knownIds())
    if (!check.ok) return check
    if (o.nodeRef && !nodeExists(o.nodeRef)) return { ok: false, reason: 'unknown-node' }
    const rel: Relationship = {
      version: RELATIONSHIP_VERSION,
      id: newId(),
      fromId: o.fromId,
      toId: o.toId,
      typeId: o.typeId,
      note: o.note ?? EMPTY_DOC(),
      nodeRef: o.nodeRef ?? null,
    }
    const path = relationshipPath(rel.id)
    await p.saveItem(path, relationshipSchema, rel)
    statuses.set(rel.id, { status: 'ok' })
    relationshipDocs.value = new Map(relationshipDocs.value).set(rel.id, rel)
    projectStore.setRelationRefs({
      relationships: [...p.manifest.relationships, { id: rel.id, path }],
    })
    rebuildLists()
    markSeen(path)
    return { ok: true, id: rel.id }
  }

  /** Ends, type and node link are re-checked only when they change (a broken relationship's note stays editable). */
  function updateRelationship(id: string, patch: RelationshipPatch): RelationshipOutcome {
    const p = projectStore.project
    const rel = relationshipDocs.value.get(id)
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!rel) return { ok: false, reason: 'unknown-relationship' }
    const next: Relationship = { ...rel, ...patch }
    if (next.fromId !== rel.fromId || next.toId !== rel.toId || next.typeId !== rel.typeId) {
      const check = validateNewRelationship(relationships.value, { ...next, id }, knownIds())
      if (!check.ok) return check
    }
    const ref = patch.nodeRef
    if (ref && !nodeExists(ref)) return { ok: false, reason: 'unknown-node' }
    if (!commitRelationship(next)) return { ok: false, reason: 'read-only' }
    return { ok: true }
  }

  /** Plain delete (no trash). false = refused. */
  async function deleteRelationship(id: string): Promise<boolean> {
    const p = projectStore.project
    const item = relationshipList.value.find((e) => e.id === id)
    if (!p || p.readOnly || !item) return false
    return removeItem('relationship', id, item.path)
  }

  /** Drops a listed file: docs, manifest ref, then the file once pending saves are flushed. */
  async function removeItem(kind: Kind, id: string, path: string): Promise<boolean> {
    const p = projectStore.project
    if (!p) return false
    const docs: Docs = new Map(docsOf(kind))
    docs.delete(id)
    setDocs(kind, docs)
    statuses.delete(id)
    if (kind === 'type')
      projectStore.setRelationRefs({ relationTypes: p.manifest.relationTypes.filter((r) => r.id !== id) })
    else if (kind === 'relationship')
      projectStore.setRelationRefs({ relationships: p.manifest.relationships.filter((r) => r.id !== id) })
    else projectStore.setRelationRefs({ groups: p.manifest.groups.filter((r) => r.id !== id) })
    rebuildLists()
    try {
      await projectStore.flush() // the manifest is saved before the file goes
      await projectStore.removeUnlistedFile(path)
    } catch (e) {
      console.error('Could not remove the file', e)
      return false
    }
    return true
  }

  // ---- groups ----

  const groupsOfEntry = (entryId: string): Group[] => groupsContaining(groups.value, entryId)

  function commitGroup(next: Group): boolean {
    const path = groupList.value.find((e) => e.id === next.id)?.path
    if (!path || !projectStore.updateItem(path, groupSchema, next)) return false
    groupDocs.value = new Map(groupDocs.value).set(next.id, next)
    return true
  }

  /** New empty group at the end of the list. null = refused (read-only, empty name). */
  async function createGroup(name: string, color = DEFAULT_COLOR): Promise<string | null> {
    const p = projectStore.project
    const n = clean(name)
    if (!p || p.readOnly || !n) return null
    const group: Group = { version: GROUP_VERSION, id: newId(), name: n, color, memberIds: [] }
    const path = groupPath(group.id)
    await p.saveItem(path, groupSchema, group)
    statuses.set(group.id, { status: 'ok' })
    groupDocs.value = new Map(groupDocs.value).set(group.id, group)
    projectStore.setRelationRefs({ groups: [...p.manifest.groups, { id: group.id, path, title: n }] })
    rebuildLists()
    markSeen(path)
    return group.id
  }

  function updateGroup(id: string, patch: GroupPatch): GroupOutcome {
    const p = projectStore.project
    const group = groupDocs.value.get(id)
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!group) return { ok: false, reason: 'unknown-group' }
    const name = patch.name === undefined ? group.name : clean(patch.name)
    if (!name) return { ok: false, reason: 'empty-name' }
    if (!commitGroup({ ...group, ...patch, name })) return { ok: false, reason: 'read-only' }
    if (name !== group.name)
      projectStore.setRelationRefs({
        groups: p.manifest.groups.map((r) => (r.id === id ? { ...r, title: name } : r)),
      })
    rebuildLists()
    return { ok: true }
  }

  /** Plain delete (no trash); members are untouched. false = refused. */
  async function deleteGroup(id: string): Promise<boolean> {
    const p = projectStore.project
    const item = groupList.value.find((e) => e.id === id)
    if (!p || p.readOnly || !item) return false
    return removeItem('group', id, item.path)
  }

  /** Adds a live entry once; adding a member again is a no-op. */
  function addMember(groupId: string, entryId: string): MemberOutcome {
    const group = groupDocs.value.get(groupId)
    if (projectStore.readOnly) return { ok: false, reason: 'read-only' }
    if (!group) return { ok: false, reason: 'unknown-group' }
    if (!codex.entries.some((e) => e.id === entryId)) return { ok: false, reason: 'unknown-entry' }
    const next = withMember(group, entryId)
    if (next !== group && !commitGroup(next)) return { ok: false, reason: 'read-only' }
    return { ok: true }
  }

  /** Removes a member, also a trashed one. */
  function removeMember(groupId: string, entryId: string): MemberOutcome {
    const group = groupDocs.value.get(groupId)
    if (projectStore.readOnly) return { ok: false, reason: 'read-only' }
    if (!group) return { ok: false, reason: 'unknown-group' }
    const next = withoutMember(group, entryId)
    if (next !== group && !commitGroup(next)) return { ok: false, reason: 'read-only' }
    return { ok: true }
  }

  // ---- graph layout ----

  /** Merges dragged positions into the saved layout; the file is created on the first save. false = refused. */
  async function savePositions(partial: Record<string, Position>): Promise<boolean> {
    const p = projectStore.project
    if (!p || p.readOnly) return false
    const next = relationLayoutSchema.safeParse({
      version: RELATION_LAYOUT_VERSION,
      positions: { ...layout.value, ...partial },
    })
    if (!next.success) return false
    const ref = p.manifest.relationLayout
    if (ref) {
      if (layoutStatus.value !== 'ok' || !projectStore.updateItem(ref.path, relationLayoutSchema, next.data))
        return false
      setLayout(next.data, 'ok')
      return true
    }
    if (layoutStatus.value !== 'none') return false
    await p.saveItem(RELATION_LAYOUT_PATH, relationLayoutSchema, next.data)
    setLayout(next.data, 'ok')
    projectStore.setRelationRefs({ relationLayout: { id: newId(), path: RELATION_LAYOUT_PATH } })
    markSeen(RELATION_LAYOUT_PATH)
    return true
  }

  /** Forgets all dragged positions (the graph lays out automatically again). */
  async function resetLayout(): Promise<boolean> {
    if (layoutStatus.value === 'none') return !projectStore.readOnly
    const p = projectStore.project
    const ref = p?.manifest.relationLayout
    if (!p || p.readOnly || !ref || layoutStatus.value !== 'ok') return false
    const empty: RelationLayout = { version: RELATION_LAYOUT_VERSION, positions: {} }
    if (!projectStore.updateItem(ref.path, relationLayoutSchema, empty)) return false
    setLayout(empty, 'ok')
    return true
  }

  return {
    readOnly,
    types,
    relationships,
    groups,
    typeList,
    relationshipList,
    groupList,
    layout,
    layoutStatus,
    layoutError,
    brokenRelationshipIds,
    brokenNodeRefIds,
    brokenMembershipsList,
    load,
    reset,
    createType,
    findOrCreateTypeByName,
    updateType,
    planDeleteType,
    deleteType,
    relationsFor,
    relationshipsOnNode,
    createRelationship,
    updateRelationship,
    deleteRelationship,
    groupsOfEntry,
    createGroup,
    updateGroup,
    deleteGroup,
    addMember,
    removeMember,
    savePositions,
    resetLayout,
  }
})
