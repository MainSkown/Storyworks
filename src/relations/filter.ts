export interface FilterEntry {
  id: string
  typeId: string
}
export interface FilterRelationship {
  id: string
  fromId: string
  toId: string
  typeId: string
}
export interface FilterGroup {
  id: string
  memberIds: string[]
}
export interface GraphFilter {
  relationTypeIds: string[]
  entryTypeIds: string[]
  groupIds: string[]
}
export interface GraphFilterResult {
  visibleEntryIds: Set<string>
  visibleRelationshipIds: Set<string>
  dimmedEntryIds: Set<string>
  /** Always empty today: relationships are hidden by the filter, not dimmed. */
  dimmedRelationshipIds: Set<string>
}

/**
 * Entry-type and group filters pick the shown entries; the relation-type filter picks shown
 * relationships (both ends must be shown). Entries the relation-type filter leaves without
 * any edge stay visible but dimmed.
 */
export function filterGraph(
  data: { entries: FilterEntry[]; relationships: FilterRelationship[]; groups: FilterGroup[] },
  f: GraphFilter,
): GraphFilterResult {
  const entryTypes = new Set(f.entryTypeIds)
  const relTypes = new Set(f.relationTypeIds)
  const inGroups = new Set<string>()
  if (f.groupIds.length) {
    const wanted = new Set(f.groupIds)
    for (const g of data.groups) if (wanted.has(g.id)) for (const m of g.memberIds) inGroups.add(m)
  }

  const visibleEntryIds = new Set<string>()
  for (const e of data.entries) {
    if (entryTypes.size && !entryTypes.has(e.typeId)) continue
    if (f.groupIds.length && !inGroups.has(e.id)) continue
    visibleEntryIds.add(e.id)
  }

  const visibleRelationshipIds = new Set<string>()
  const hadEdge = new Set<string>()
  const hasEdge = new Set<string>()
  for (const r of data.relationships) {
    if (!visibleEntryIds.has(r.fromId) || !visibleEntryIds.has(r.toId)) continue
    hadEdge.add(r.fromId).add(r.toId)
    if (relTypes.size && !relTypes.has(r.typeId)) continue
    visibleRelationshipIds.add(r.id)
    hasEdge.add(r.fromId).add(r.toId)
  }

  const dimmedEntryIds = new Set<string>()
  if (relTypes.size) for (const id of hadEdge) if (!hasEdge.has(id)) dimmedEntryIds.add(id)

  return {
    visibleEntryIds,
    visibleRelationshipIds,
    dimmedEntryIds,
    dimmedRelationshipIds: new Set(),
  }
}
