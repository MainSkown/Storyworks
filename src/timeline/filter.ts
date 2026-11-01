export interface FilterNode {
  id: string
  tag?: string | null
  branchId?: string | null
  codexIds?: string[]
}

export interface Filter {
  tags: string[]
  /** `null` stands for the main line. */
  branchIds: (string | null)[]
  /** Only nodes linking this codex entry. */
  entryId?: string | null
}

export interface FilterResult {
  matched: Set<string>
  dimmedNodes: Set<string>
  /** Edges with at least one non-matching end. */
  dimmedEdges: Set<string>
}

export const isEmptyFilter = (f: Filter) => f.tags.length === 0 && f.branchIds.length === 0 && !f.entryId

/** Nothing is removed: non-matching nodes and their edges are reported as dimmed. */
export function applyFilter(
  nodes: FilterNode[],
  edges: { id: string; from: string; to: string }[],
  filter: Filter,
): FilterResult {
  const matched = new Set<string>()
  const dimmedNodes = new Set<string>()
  for (const n of nodes) {
    const tagOk = filter.tags.length === 0 || (n.tag != null && filter.tags.includes(n.tag))
    const branchOk = filter.branchIds.length === 0 || filter.branchIds.includes(n.branchId ?? null)
    const entryOk = !filter.entryId || (n.codexIds?.includes(filter.entryId) ?? false)
    ;(tagOk && branchOk && entryOk ? matched : dimmedNodes).add(n.id)
  }
  const dimmedEdges = new Set(
    edges.filter((e) => !matched.has(e.from) || !matched.has(e.to)).map((e) => e.id),
  )
  return { matched, dimmedNodes, dimmedEdges }
}
