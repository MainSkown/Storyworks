interface PickType {
  id: string
  name: string
  color: string
}
interface PickEntry {
  id: string
  name: string
  typeId: string
  aliases: readonly string[]
}

export interface PickerEntryRow {
  entryId: string
  name: string
  typeName: string | null
}

export interface PickerEntryGroup {
  /** null = entries whose type is no longer listed */
  typeId: string | null
  typeName: string | null
  rows: PickerEntryRow[]
}

/** Entries grouped by type (type order, entries keep their order); a query matches names and aliases. */
export function groupPickerEntries(
  entries: readonly PickEntry[],
  types: readonly PickType[],
  query: string,
): PickerEntryGroup[] {
  const q = query.trim().toLowerCase()
  const hits = entries.filter(
    (e) =>
      !q || e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)),
  )
  const row = (e: PickEntry, typeName: string | null): PickerEntryRow => ({
    entryId: e.id,
    name: e.name,
    typeName,
  })
  const groups: PickerEntryGroup[] = types
    .map((t) => ({
      typeId: t.id as string | null,
      typeName: t.name as string | null,
      rows: hits.filter((e) => e.typeId === t.id).map((e) => row(e, t.name)),
    }))
    .filter((g) => g.rows.length > 0)
  const known = new Set(types.map((t) => t.id))
  const orphans = hits.filter((e) => !known.has(e.typeId)).map((e) => row(e, null))
  return orphans.length ? [...groups, { typeId: null, typeName: null, rows: orphans }] : groups
}

/** Display data of a link target entry, or null when the entry is not there. */
export function describeEntry(
  entries: readonly PickEntry[],
  types: readonly PickType[],
  entryId: string,
): { name: string; typeName: string | null; typeColor: string | null } | null {
  const e = entries.find((x) => x.id === entryId)
  if (!e) return null
  const t = types.find((x) => x.id === e.typeId)
  return { name: e.name, typeName: t?.name ?? null, typeColor: t?.color ?? null }
}
