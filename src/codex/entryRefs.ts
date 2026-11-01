export interface TypeLike {
  id: string
  name: string
}
export interface EntryLike {
  id: string
  typeId: string
  name: string
}

export type EntryRef<E extends EntryLike = EntryLike> =
  { id: string; missing: false; entry: E; typeName: string | null } | { id: string; missing: true }

/** Ids (deduplicated, in order) resolved to their entry and type name, or marked missing. */
export function resolveEntryRefs<E extends EntryLike>(
  ids: readonly string[],
  entries: readonly E[],
  types: readonly TypeLike[],
): EntryRef<E>[] {
  const byId = new Map(entries.map((e) => [e.id, e]))
  return [...new Set(ids)].map((id) => {
    const entry = byId.get(id)
    if (!entry) return { id, missing: true as const }
    return {
      id,
      missing: false as const,
      entry,
      typeName: types.find((t) => t.id === entry.typeId)?.name ?? null,
    }
  })
}

/** All entries for the POV picker: those of a type named Character first, each group in given order. */
export function povOptions<E extends EntryLike>(
  entries: readonly E[],
  types: readonly TypeLike[],
): E[] {
  const characterTypes = new Set(
    types.filter((t) => t.name.trim().toLowerCase() === 'character').map((t) => t.id),
  )
  return [
    ...entries.filter((e) => characterTypes.has(e.typeId)),
    ...entries.filter((e) => !characterTypes.has(e.typeId)),
  ]
}

interface LinkLike {
  kind: string
  from: { item: string }
  to: { item: string }
}

/** Entry ids a scene links (codex links from its blocks), then its POV; each once. */
export function sceneEntryIds(
  links: readonly LinkLike[],
  sceneId: string,
  povId: string | undefined,
): string[] {
  const ids = links
    .filter((l) => l.kind === 'codex' && l.from.item === sceneId)
    .map((l) => l.to.item)
  if (povId) ids.push(povId)
  return [...new Set(ids)]
}
