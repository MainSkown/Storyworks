import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { addImage } from '../project/assets'
import {
  brokenCodexLinks,
  brokenEntryRuleLinks,
  codexEntryPath,
  codexTypePath,
  deleteTypePlan,
  entriesUsingRule,
  filterEntries,
  loadCodexEntries,
  loadCodexTypes,
  nodesUsingEntry,
  reassignEntries,
  type BrokenCodexLink,
  type DeleteTypePlan,
  type EntryFilter,
  type EntryUsage,
} from '../project/codex'
import { newId } from '../project/ids'
import type { ItemStatus } from '../project/rules'
import {
  aliasKey,
  CODEX_ENTRY_VERSION,
  codexEntrySchema,
  isAssetPath,
  type CodexEntry,
} from '../project/schemas/codexEntry'
import { CODEX_TYPE_VERSION, codexTypeSchema, type CodexType } from '../project/schemas/codexType'
import { parseFile } from '../project/serialize'
import { useProjectStore } from '../project/store'
import type { FileError } from '../project/types'
import { useRulesStore } from '../rules/store'
import { useTimelinesStore } from '../timeline/store'

/** One listed file, in manifest order. `status` is not 'ok' for files the UI shows as "invalid file" / "missing". */
export interface ListEntry {
  id: string
  path: string
  title: string
  status: ItemStatus
  error?: FileError
}

export type EntryPatch = Partial<
  Pick<
    CodexEntry,
    | 'name'
    | 'typeId'
    | 'aliases'
    | 'image'
    | 'notes'
    | 'tags'
    | 'ruleIds'
    | 'appendixText'
    | 'includeInAppendices'
    | 'states'
  >
>
export type TypePatch = Partial<Pick<CodexType, 'name' | 'color' | 'icon'>>

export type EntryOutcome =
  { ok: true } | { ok: false; reason: 'read-only' | 'unknown-entry' | 'unknown-type' | 'bad-image' }
export type TypeOutcome =
  { ok: true } | { ok: false; reason: 'read-only' | 'unknown-type' | 'empty-name' }
export type DeleteTypeOutcome =
  | { ok: true; moved: number }
  | {
      ok: false
      reason: 'read-only' | Extract<DeleteTypePlan, { ok: false }>['reason'] | 'unknown'
    }

export interface EntryGroup {
  /** null = entries whose type is no longer listed */
  type: CodexType | null
  entries: CodexEntry[]
}

const DEFAULT_COLOR = '#8e4a9e'
const DEFAULT_ICON = 'label'
const EMPTY_FILTER = (): Required<EntryFilter> => ({ typeId: null, tags: [], query: '' })

const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
/** Trimmed, non-empty, no case-insensitive duplicates (the schema rejects those). */
function cleanAliases(aliases: string[]): string[] {
  const seen = new Set<string>()
  return aliases
    .map((a) => a.trim())
    .filter((a) => a && !seen.has(aliasKey(a)) && seen.add(aliasKey(a)))
}

export const useCodexStore = defineStore('codex', () => {
  const projectStore = useProjectStore()
  const timelines = useTimelinesStore()
  const rulesStore = useRulesStore()

  const entryDocs = shallowRef(new Map<string, CodexEntry>())
  const typeDocs = shallowRef(new Map<string, CodexType>())
  const entryList = shallowRef<ListEntry[]>([])
  const typeList = shallowRef<ListEntry[]>([])
  const selectedId = ref<string | null>(null)
  const filter = ref<Required<EntryFilter>>(EMPTY_FILTER())
  const statuses = new Map<string, { status: ItemStatus; error?: FileError }>()
  const seen = new Map<string, number>()

  const readOnly = computed(() => projectStore.readOnly)
  /** Readable entries in manifest order. */
  const entries = computed(() => [...entryDocs.value.values()])
  /** Readable types in manifest order. */
  const types = computed(() => [...typeDocs.value.values()])
  const selected = computed(() =>
    selectedId.value ? (entryDocs.value.get(selectedId.value) ?? null) : null,
  )
  const allTags = computed(() => [...new Set(entries.value.flatMap((e) => e.tags))].sort())
  const filterActive = computed(
    () => !!filter.value.typeId || filter.value.tags.length > 0 || filter.value.query.trim() !== '',
  )
  const filteredEntries = computed(() => filterEntries(entries.value, filter.value))
  /** Filtered entries grouped by type, in type order; empty groups included. */
  const groups = computed<EntryGroup[]>(() => {
    const out: EntryGroup[] = types.value.map((type) => ({ type, entries: [] }))
    const orphans: EntryGroup = { type: null, entries: [] }
    for (const e of filteredEntries.value)
      (out.find((g) => g.type?.id === e.typeId) ?? orphans).entries.push(e)
    return orphans.entries.length ? [...out, orphans] : out
  })
  /** Entries in the trash, for the Trash dialog (the same entries are in the project store's `trash`). */
  const trashedEntries = computed(() => projectStore.trash.filter((t) => t.type === 'entry'))
  /** Node links pointing at an entry that is not listed (deleted, trashed). */
  const brokenLinks = computed<BrokenCodexLink[]>(() =>
    brokenCodexLinks(timelines.loadedTimelines, new Set(entryList.value.map((e) => e.id))),
  )
  /** Rule ids on entries that point at no listed rule. */
  const brokenRuleLinks = computed(() =>
    brokenEntryRuleLinks(entries.value, new Set(rulesStore.ruleEntries.map((e) => e.id))),
  )

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
    entryList.value = (m?.codexEntries ?? []).map(item)
    typeList.value = (m?.codexTypes ?? []).map(item)
  }

  function reseedVersions(): void {
    seen.clear()
    for (const e of [...entryList.value, ...typeList.value])
      seen.set(e.path, projectStore.itemVersion(e.path))
  }

  function ensureSelection(): void {
    if (selectedId.value && !entryDocs.value.has(selectedId.value)) selectedId.value = null
    if (filter.value.typeId && !typeDocs.value.has(filter.value.typeId))
      filter.value = { ...filter.value, typeId: null }
  }

  /** Reads everything again (after open, or after project.json was reloaded). */
  async function load(): Promise<void> {
    const p = projectStore.project
    if (!p) return reset()
    const [e, t] = await Promise.all([loadCodexEntries(p), loadCodexTypes(p)])
    entryDocs.value = e.items
    typeDocs.value = t.items
    statuses.clear()
    for (const l of [e, t])
      for (const [id, status] of l.status) statuses.set(id, { status, error: l.errors.get(id) })
    rebuildLists()
    ensureSelection()
    reseedVersions()
  }

  function reset(): void {
    entryDocs.value = new Map()
    typeDocs.value = new Map()
    entryList.value = []
    typeList.value = []
    statuses.clear()
    seen.clear()
    selectedId.value = null
    filter.value = EMPTY_FILTER()
  }

  async function rereadOne(kind: 'entry' | 'type', id: string, path: string): Promise<void> {
    const p = projectStore.project
    if (!p) return
    const text = await p.io.readText(path)
    const schema = kind === 'entry' ? codexEntrySchema : codexTypeSchema
    const r = text === null ? null : parseFile<{ id: string }>(schema, text, path)
    const docs = new Map<string, CodexEntry | CodexType>(
      kind === 'entry' ? entryDocs.value : typeDocs.value,
    )
    if (r?.ok && r.value.id === id) {
      docs.set(id, r.value as CodexEntry & CodexType)
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
    const refs = kind === 'entry' ? p.manifest.codexEntries : p.manifest.codexTypes
    const ordered = new Map(
      refs.flatMap((ref) => (docs.has(ref.id) ? [[ref.id, docs.get(ref.id)!] as const] : [])),
    )
    if (kind === 'entry') entryDocs.value = ordered as Map<string, CodexEntry>
    else typeDocs.value = ordered as Map<string, CodexType>
    rebuildLists()
    ensureSelection()
  }

  // Files changed on disk (the project store reloads them and bumps their version).
  watch(
    () => [
      ...entryList.value.map(
        (e) => ['entry', e.id, e.path, projectStore.itemVersion(e.path)] as const,
      ),
      ...typeList.value.map(
        (e) => ['type', e.id, e.path, projectStore.itemVersion(e.path)] as const,
      ),
    ],
    async (now) => {
      for (const [kind, id, path, version] of now) {
        if (seen.get(path) === version) continue
        seen.set(path, version)
        await rereadOne(kind, id, path)
      }
    },
  )

  // ---- selection and filter ----

  function select(id: string | null): void {
    if (id !== null && !entryDocs.value.has(id)) return
    selectedId.value = id
  }
  const setTypeFilter = (typeId: string | null) => {
    filter.value = { ...filter.value, typeId }
  }
  const setQuery = (query: string) => {
    filter.value = { ...filter.value, query }
  }
  function toggleTag(tag: string): void {
    const has = filter.value.tags.includes(tag)
    filter.value = {
      ...filter.value,
      tags: has ? filter.value.tags.filter((t) => t !== tag) : [...filter.value.tags, tag],
    }
  }
  const clearFilter = () => {
    filter.value = EMPTY_FILTER()
  }

  // ---- entries ----

  /** Timeline nodes that link the entry (all timelines). */
  const usedInNodes = (entryId: string): EntryUsage[] =>
    nodesUsingEntry(timelines.loadedTimelines, entryId)
  /** Entries that list the rule. */
  const usedByRule = (ruleId: string): CodexEntry[] => entriesUsingRule(entries.value, ruleId)

  /** Records the value for autosave and shows it. false = refused (read-only, invalid file). */
  function commitEntry(next: CodexEntry): boolean {
    const path = entryList.value.find((e) => e.id === next.id)?.path
    if (!path || !projectStore.updateItem(path, codexEntrySchema, next)) return false
    entryDocs.value = new Map(entryDocs.value).set(next.id, next)
    return true
  }

  /** New entry at the end of the list (default type: the first); it becomes the selected one. null = refused. */
  async function createEntry(o: { name?: string; typeId?: string } = {}): Promise<string | null> {
    const p = projectStore.project
    if (!p || p.readOnly) return null
    const typeId = o.typeId ?? types.value[0]?.id
    if (!typeId || !typeDocs.value.has(typeId)) return null
    const entry = codexEntrySchema.parse({
      version: CODEX_ENTRY_VERSION,
      id: newId(),
      typeId,
      name: o.name?.trim() ?? '',
    })
    await p.saveItem(codexEntryPath(entry.id), codexEntrySchema, entry)
    statuses.set(entry.id, { status: 'ok' })
    entryDocs.value = new Map(entryDocs.value).set(entry.id, entry)
    projectStore.setCodexRefs({
      codexEntries: [
        ...p.manifest.codexEntries,
        { id: entry.id, path: codexEntryPath(entry.id), title: entry.name },
      ],
    })
    rebuildLists()
    selectedId.value = entry.id
    return entry.id
  }

  function updateEntry(id: string, patch: EntryPatch): EntryOutcome {
    const p = projectStore.project
    const entry = entryDocs.value.get(id)
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!entry) return { ok: false, reason: 'unknown-entry' }
    if (patch.typeId !== undefined && !typeDocs.value.has(patch.typeId))
      return { ok: false, reason: 'unknown-type' }
    if (patch.image != null && !isAssetPath(patch.image)) return { ok: false, reason: 'bad-image' }
    const next: CodexEntry = {
      ...entry,
      ...patch,
      name: patch.name === undefined ? entry.name : patch.name.trim(),
      aliases: patch.aliases === undefined ? entry.aliases : cleanAliases(patch.aliases),
      tags: patch.tags === undefined ? entry.tags : cleanTags(patch.tags),
      ruleIds: patch.ruleIds === undefined ? entry.ruleIds : [...new Set(patch.ruleIds)],
    }
    if (!commitEntry(next)) return { ok: false, reason: 'read-only' }
    if (next.name !== entry.name)
      projectStore.setCodexRefs({
        codexEntries: p.manifest.codexEntries.map((r) =>
          r.id === id ? { ...r, title: next.name } : r,
        ),
      })
    rebuildLists()
    return { ok: true }
  }

  /** Copies the image into `assets/` and stores its relative path on the entry. */
  async function importImage(id: string, bytes: Uint8Array, ext: string): Promise<EntryOutcome> {
    const p = projectStore.project
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!entryDocs.value.has(id)) return { ok: false, reason: 'unknown-entry' }
    const path = await addImage(p.io, bytes, ext, newId)
    return updateEntry(id, { image: path })
  }

  /** Moves the entry (listed or invalid) to the trash. Links to it stay and show as missing until restore. false = refused. */
  async function deleteEntry(id: string): Promise<boolean> {
    const item = entryList.value.find((e) => e.id === id)
    if (!item || projectStore.readOnly) return false
    await projectStore.trashEntry(id, entryDocs.value.get(id)?.name ?? item.title)
    const next = new Map(entryDocs.value)
    next.delete(id)
    entryDocs.value = next
    statuses.delete(id)
    if (selectedId.value === id) selectedId.value = null
    rebuildLists()
    reseedVersions()
    return true
  }

  /**
   * Puts a trashed entry back (also what the project store's restoreItem does for entry trash records).
   * Throws EntryRestoreError; an entry whose type is gone moves to the first type.
   */
  async function restoreEntry(id: string): Promise<void> {
    await projectStore.restoreEntryFile(id)
    await load()
    const entry = entryDocs.value.get(id)
    const fallback = types.value[0]
    if (entry && fallback && !typeDocs.value.has(entry.typeId))
      commitEntry({ ...entry, typeId: fallback.id })
  }

  // ---- types ----

  /** New type at the end of the list. null = refused (read-only, empty name). */
  async function createType(
    name: string,
    color = DEFAULT_COLOR,
    icon = DEFAULT_ICON,
  ): Promise<string | null> {
    const p = projectStore.project
    const clean = name.trim()
    if (!p || p.readOnly || !clean) return null
    const type: CodexType = { version: CODEX_TYPE_VERSION, id: newId(), name: clean, color, icon }
    const path = codexTypePath(type.id)
    await p.saveItem(path, codexTypeSchema, type)
    statuses.set(type.id, { status: 'ok' })
    typeDocs.value = new Map(typeDocs.value).set(type.id, type)
    projectStore.setCodexRefs({
      codexTypes: [...p.manifest.codexTypes, { id: type.id, path, title: clean }],
    })
    rebuildLists()
    return type.id
  }

  function updateType(id: string, patch: TypePatch): TypeOutcome {
    const p = projectStore.project
    const type = typeDocs.value.get(id)
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!type) return { ok: false, reason: 'unknown-type' }
    const name = patch.name === undefined ? type.name : patch.name.trim()
    if (!name) return { ok: false, reason: 'empty-name' }
    const next: CodexType = { ...type, ...patch, name }
    const path = typeList.value.find((e) => e.id === id)?.path
    if (!path || !projectStore.updateItem(path, codexTypeSchema, next))
      return { ok: false, reason: 'read-only' }
    typeDocs.value = new Map(typeDocs.value).set(id, next)
    if (name !== type.name)
      projectStore.setCodexRefs({
        codexTypes: p.manifest.codexTypes.map((r) => (r.id === id ? { ...r, title: name } : r)),
      })
    rebuildLists()
    return { ok: true }
  }

  /** What deleting would do (for the confirm dialog): entries to move, or why it is refused. */
  const planDeleteType = (id: string, targetId?: string | null): DeleteTypePlan =>
    deleteTypePlan(
      types.value.map((t) => t.id),
      entries.value,
      id,
      targetId,
    )

  /** Moves the type's entries to `targetId` (required when it has entries), then removes the type file. */
  async function deleteType(id: string, targetId?: string | null): Promise<DeleteTypeOutcome> {
    const p = projectStore.project
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    const plan = planDeleteType(id, targetId)
    if (!plan.ok) return plan
    const path = typeList.value.find((e) => e.id === id)?.path
    if (!path) return { ok: false, reason: 'unknown-type' }
    if (plan.targetId) {
      const moved = reassignEntries(entries.value, id, plan.targetId).filter((e) =>
        plan.reassign.includes(e.id),
      )
      if (!moved.every(commitEntry)) return { ok: false, reason: 'unknown' }
    }
    const next = new Map(typeDocs.value)
    next.delete(id)
    typeDocs.value = next
    statuses.delete(id)
    projectStore.setCodexRefs({ codexTypes: p.manifest.codexTypes.filter((r) => r.id !== id) })
    if (filter.value.typeId === id) setTypeFilter(null)
    rebuildLists()
    try {
      await projectStore.flush() // entries and the manifest are saved before the file goes
      await projectStore.removeUnlistedFile(path)
    } catch (e) {
      console.error('Could not remove the type file', e)
      return { ok: false, reason: 'unknown' }
    }
    return { ok: true, moved: plan.reassign.length }
  }

  return {
    readOnly,
    entries,
    types,
    entryList,
    typeList,
    selectedId,
    selected,
    allTags,
    filter,
    filterActive,
    filteredEntries,
    groups,
    trashedEntries,
    brokenLinks,
    brokenRuleLinks,
    load,
    reset,
    select,
    setTypeFilter,
    setQuery,
    toggleTag,
    clearFilter,
    usedInNodes,
    usedByRule,
    createEntry,
    updateEntry,
    importImage,
    deleteEntry,
    restoreEntry,
    createType,
    updateType,
    planDeleteType,
    deleteType,
  }
})
