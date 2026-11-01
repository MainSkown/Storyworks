export interface EntryLike {
  id: string
  name: string
  typeId: string
  aliases: readonly string[]
  tags: readonly string[]
}
export interface TypeLike {
  id: string
  name: string
}

export type NodeEntry<E extends EntryLike = EntryLike> =
  { id: string; missing: false; entry: E; typeName: string | null } | { id: string; missing: true }

/** A node's entry ids, in node order, each resolved to its entry or marked missing. */
export function resolveNodeEntries<E extends EntryLike>(
  codexIds: readonly string[],
  entries: readonly E[],
  types: readonly TypeLike[],
): NodeEntry<E>[] {
  const byId = new Map(entries.map((e) => [e.id, e]))
  return codexIds.map((id) => {
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

/** The id list with `id` added once. */
export const addEntryId = (ids: readonly string[], id: string): string[] =>
  ids.includes(id) ? [...ids] : [...ids, id]

export interface PickerEntryGroup<E extends EntryLike = EntryLike> {
  typeId: string | null
  name: string
  entries: E[]
}

/** Entries matching every word of `query` (name, aliases, tags, type), not yet linked, grouped by type; empty groups left out. */
export function groupPickerEntries<E extends EntryLike>(
  entries: readonly E[],
  types: readonly TypeLike[],
  query: string,
  linked: readonly string[],
): PickerEntryGroup<E>[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const skip = new Set(linked)
  const names = new Map(types.map((t) => [t.id, t.name]))
  const groups: PickerEntryGroup<E>[] = types.map((t) => ({
    typeId: t.id,
    name: t.name,
    entries: [],
  }))
  const orphans: PickerEntryGroup<E> = { typeId: null, name: '', entries: [] }
  for (const e of entries) {
    if (skip.has(e.id)) continue
    const hay = [e.name, ...e.aliases, ...e.tags, names.get(e.typeId) ?? '']
      .join('\n')
      .toLowerCase()
    if (!words.every((w) => hay.includes(w))) continue
    ;(groups.find((g) => g.typeId === e.typeId) ?? orphans).entries.push(e)
  }
  return [...groups, orphans].filter((g) => g.entries.length)
}
