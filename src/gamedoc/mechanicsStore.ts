import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { addLink as addLinkTo, removeLink as removeLinkFrom } from '../game/mechanicLinks'
import {
  filterMechanics,
  loadMechanicCategories,
  loadMechanics,
  mechanicCategoryPath,
  mechanicPath,
  moveRef,
  reassignMechanics,
  type MechanicFilter,
} from '../project/gamedoc'
import { newId } from '../project/ids'
import {
  deleteCategoryPlan,
  type DeleteCategoryPlan,
  type ItemStatus,
} from '../project/rules'
import {
  MECHANIC_VERSION,
  mechanicSchema,
  type Mechanic,
  type MechanicLink,
  type MechanicStatus,
} from '../project/schemas/mechanic'
import {
  MECHANIC_CATEGORY_VERSION,
  mechanicCategorySchema,
  type MechanicCategory,
} from '../project/schemas/mechanicCategory'
import { parseFile } from '../project/serialize'
import { useProjectStore } from '../project/store'
import type { FileError } from '../project/types'

/** One listed file, in manifest order. `status` is not 'ok' for files the UI shows as "invalid file" / "missing". */
export interface MechanicEntry {
  id: string
  path: string
  title: string
  status: ItemStatus
  error?: FileError
}

export type MechanicPatch = Partial<
  Pick<Mechanic, 'title' | 'summary' | 'categoryId' | 'status' | 'tags' | 'description' | 'parameters' | 'links'>
>
export type CategoryPatch = Partial<Pick<MechanicCategory, 'name' | 'color'>>

export type MechanicOutcome =
  | { ok: true }
  | { ok: false; reason: 'read-only' | 'unknown-mechanic' | 'unknown-category' | 'invalid' }
export type CategoryOutcome =
  | { ok: true }
  | { ok: false; reason: 'read-only' | 'unknown-category' | 'empty-name' }
export type DeleteCategoryOutcome =
  | { ok: true; moved: number }
  | { ok: false; reason: 'read-only' | Extract<DeleteCategoryPlan, { ok: false }>['reason'] | 'unknown' }

const DEFAULT_COLOR = '#6b7280'
const EMPTY_FILTER = (): Required<MechanicFilter> => ({ categoryId: null, status: null, tags: [], query: '' })
const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim()).filter(Boolean))]

export const useMechanicsStore = defineStore('mechanics', () => {
  const projectStore = useProjectStore()

  const docs = shallowRef(new Map<string, Mechanic>())
  const categoryDocs = shallowRef(new Map<string, MechanicCategory>())
  const mechanicEntries = shallowRef<MechanicEntry[]>([])
  const categoryEntries = shallowRef<MechanicEntry[]>([])
  const selectedId = ref<string | null>(null)
  const filter = ref<Required<MechanicFilter>>(EMPTY_FILTER())
  const statuses = new Map<string, { status: ItemStatus; error?: FileError }>()
  const seen = new Map<string, number>()

  const readOnly = computed(() => projectStore.readOnly)
  /** Readable mechanics in manifest order. */
  const mechanics = computed(() => [...docs.value.values()])
  const categories = computed(() => [...categoryDocs.value.values()])
  const selected = computed(() => (selectedId.value ? (docs.value.get(selectedId.value) ?? null) : null))
  const allTags = computed(() => [...new Set(mechanics.value.flatMap((m) => m.tags))].sort())
  const filterActive = computed(
    () =>
      !!filter.value.categoryId ||
      !!filter.value.status ||
      filter.value.tags.length > 0 ||
      filter.value.query.trim() !== '',
  )
  const filteredMechanics = computed(() => filterMechanics(mechanics.value, filter.value))
  const trashedMechanics = computed(() => projectStore.trash.filter((t) => t.type === 'mechanic'))

  // ---- loading ----

  function rebuildEntries(): void {
    const m = projectStore.project?.manifest
    const entry = (r: { id: string; path: string; title?: string }): MechanicEntry => {
      const st = statuses.get(r.id) ?? { status: 'ok' as const }
      return { id: r.id, path: r.path, title: r.title ?? '', status: st.status, ...(st.error ? { error: st.error } : {}) }
    }
    mechanicEntries.value = (m?.mechanics ?? []).map(entry)
    categoryEntries.value = (m?.mechanicCategories ?? []).map(entry)
  }

  function reseedVersions(): void {
    seen.clear()
    for (const e of [...mechanicEntries.value, ...categoryEntries.value])
      seen.set(e.path, projectStore.itemVersion(e.path))
  }

  function ensureSelection(): void {
    if (selectedId.value && !docs.value.has(selectedId.value)) selectedId.value = null
    if (filter.value.categoryId && !categoryDocs.value.has(filter.value.categoryId))
      filter.value = { ...filter.value, categoryId: null }
  }

  async function load(): Promise<void> {
    const p = projectStore.project
    if (!p) return reset()
    const [m, c] = await Promise.all([loadMechanics(p), loadMechanicCategories(p)])
    docs.value = m.items
    categoryDocs.value = c.items
    statuses.clear()
    for (const l of [m, c])
      for (const [id, status] of l.status) statuses.set(id, { status, error: l.errors.get(id) })
    rebuildEntries()
    ensureSelection()
    reseedVersions()
  }

  function reset(): void {
    docs.value = new Map()
    categoryDocs.value = new Map()
    mechanicEntries.value = []
    categoryEntries.value = []
    statuses.clear()
    seen.clear()
    selectedId.value = null
    filter.value = EMPTY_FILTER()
  }

  async function rereadOne(kind: 'mechanic' | 'category', id: string, path: string): Promise<void> {
    const p = projectStore.project
    if (!p) return
    const text = await p.io.readText(path)
    const schema = kind === 'mechanic' ? mechanicSchema : mechanicCategorySchema
    const r = text === null ? null : parseFile<{ id: string }>(schema, text, path)
    const map = new Map<string, Mechanic | MechanicCategory>(kind === 'mechanic' ? docs.value : categoryDocs.value)
    if (r?.ok && r.value.id === id) {
      map.set(id, r.value as Mechanic & MechanicCategory)
      statuses.set(id, { status: 'ok' })
    } else {
      map.delete(id)
      statuses.set(
        id,
        r
          ? { status: 'invalid', error: r.ok ? { file: path, field: 'id', message: 'id does not match project.json' } : r.error }
          : { status: 'missing' },
      )
    }
    const refs = kind === 'mechanic' ? p.manifest.mechanics : p.manifest.mechanicCategories
    const ordered = new Map(refs.flatMap((ref) => (map.has(ref.id) ? [[ref.id, map.get(ref.id)!] as const] : [])))
    if (kind === 'mechanic') docs.value = ordered as Map<string, Mechanic>
    else categoryDocs.value = ordered as Map<string, MechanicCategory>
    rebuildEntries()
    ensureSelection()
  }

  // Files changed on disk (the project store reloads them and bumps their version).
  watch(
    () => [
      ...mechanicEntries.value.map((e) => ['mechanic', e.id, e.path, projectStore.itemVersion(e.path)] as const),
      ...categoryEntries.value.map((e) => ['category', e.id, e.path, projectStore.itemVersion(e.path)] as const),
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
    if (id !== null && !docs.value.has(id)) return
    selectedId.value = id
  }
  const setCategoryFilter = (categoryId: string | null) => {
    filter.value = { ...filter.value, categoryId }
  }
  const setStatusFilter = (status: MechanicStatus | null) => {
    filter.value = { ...filter.value, status }
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

  // ---- mechanics ----

  /** Records the value for autosave and shows it. false = refused (read-only, invalid file). */
  function commit(next: Mechanic): boolean {
    const path = mechanicEntries.value.find((e) => e.id === next.id)?.path
    if (!path || !projectStore.updateItem(path, mechanicSchema, next)) return false
    docs.value = new Map(docs.value).set(next.id, next)
    return true
  }

  /** New mechanic at the end of the list (default category: the first); it becomes the selected one. null = refused. */
  async function createMechanic(o: { title?: string; categoryId?: string } = {}): Promise<string | null> {
    const p = projectStore.project
    if (!p || p.readOnly) return null
    const categoryId = o.categoryId ?? categories.value[0]?.id
    if (!categoryId || !categoryDocs.value.has(categoryId)) return null
    const m = mechanicSchema.parse({
      version: MECHANIC_VERSION,
      id: newId(),
      title: o.title?.trim() ?? '',
      categoryId,
    })
    await p.saveItem(mechanicPath(m.id), mechanicSchema, m)
    statuses.set(m.id, { status: 'ok' })
    docs.value = new Map(docs.value).set(m.id, m)
    projectStore.setMechanicRefs({
      mechanics: [...p.manifest.mechanics, { id: m.id, path: mechanicPath(m.id), title: m.title }],
    })
    rebuildEntries()
    selectedId.value = m.id
    return m.id
  }

  function updateMechanic(id: string, patch: MechanicPatch): MechanicOutcome {
    const p = projectStore.project
    const m = docs.value.get(id)
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!m) return { ok: false, reason: 'unknown-mechanic' }
    if (patch.categoryId !== undefined && !categoryDocs.value.has(patch.categoryId))
      return { ok: false, reason: 'unknown-category' }
    const next: Mechanic = {
      ...m,
      ...patch,
      title: patch.title === undefined ? m.title : patch.title.trim(),
      tags: patch.tags === undefined ? m.tags : cleanTags(patch.tags),
    }
    if (!mechanicSchema.safeParse(next).success) return { ok: false, reason: 'invalid' }
    if (!commit(next)) return { ok: false, reason: 'read-only' }
    if (next.title !== m.title)
      projectStore.setMechanicRefs({
        mechanics: p.manifest.mechanics.map((r) => (r.id === id ? { ...r, title: next.title } : r)),
      })
    rebuildEntries()
    return { ok: true }
  }

  function addLink(id: string, link: MechanicLink): MechanicOutcome {
    const m = docs.value.get(id)
    if (!m) return { ok: false, reason: 'unknown-mechanic' }
    return updateMechanic(id, { links: addLinkTo(m, link).links })
  }

  function removeLink(id: string, link: MechanicLink): MechanicOutcome {
    const m = docs.value.get(id)
    if (!m) return { ok: false, reason: 'unknown-mechanic' }
    return updateMechanic(id, { links: removeLinkFrom(m, link).links })
  }

  /** Moves a mechanic in the manifest order (and the list). false = refused. */
  function moveMechanic(id: string, toIndex: number): boolean {
    const p = projectStore.project
    if (!p || p.readOnly || !docs.value.has(id)) return false
    const next = moveRef(p.manifest.mechanics, id, toIndex)
    if (next === p.manifest.mechanics) return true
    projectStore.setMechanicRefs({ mechanics: [...next] })
    docs.value = new Map(next.flatMap((r) => (docs.value.has(r.id) ? [[r.id, docs.value.get(r.id)!] as const] : [])))
    rebuildEntries()
    return true
  }

  /** Moves the mechanic (listed or invalid) to the trash. Links to it show as trashed until restore. false = refused. */
  async function deleteMechanic(id: string): Promise<boolean> {
    const entry = mechanicEntries.value.find((e) => e.id === id)
    if (!entry || projectStore.readOnly) return false
    await projectStore.trashMechanic(id, docs.value.get(id)?.title ?? entry.title)
    const next = new Map(docs.value)
    next.delete(id)
    docs.value = next
    statuses.delete(id)
    if (selectedId.value === id) selectedId.value = null
    rebuildEntries()
    reseedVersions()
    return true
  }

  /**
   * Puts a trashed mechanic back (also what the project store's restoreItem does for mechanic entries).
   * Throws MechanicRestoreError; one whose category is gone moves to the first category.
   */
  async function restoreMechanic(id: string): Promise<void> {
    await projectStore.restoreMechanicFile(id)
    await load()
    const m = docs.value.get(id)
    const fallback = categories.value[0]
    if (m && fallback && !categoryDocs.value.has(m.categoryId)) commit({ ...m, categoryId: fallback.id })
  }

  // ---- categories ----

  async function createCategory(name: string, color = DEFAULT_COLOR): Promise<string | null> {
    const p = projectStore.project
    const clean = name.trim()
    if (!p || p.readOnly || !clean) return null
    const cat: MechanicCategory = { version: MECHANIC_CATEGORY_VERSION, id: newId(), name: clean, color }
    const path = mechanicCategoryPath(cat.id)
    await p.saveItem(path, mechanicCategorySchema, cat)
    statuses.set(cat.id, { status: 'ok' })
    categoryDocs.value = new Map(categoryDocs.value).set(cat.id, cat)
    projectStore.setMechanicRefs({
      mechanicCategories: [...p.manifest.mechanicCategories, { id: cat.id, path, title: clean }],
    })
    rebuildEntries()
    return cat.id
  }

  function updateCategory(id: string, patch: CategoryPatch): CategoryOutcome {
    const p = projectStore.project
    const cat = categoryDocs.value.get(id)
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!cat) return { ok: false, reason: 'unknown-category' }
    const name = patch.name === undefined ? cat.name : patch.name.trim()
    if (!name) return { ok: false, reason: 'empty-name' }
    const next: MechanicCategory = { ...cat, ...patch, name }
    const path = categoryEntries.value.find((e) => e.id === id)?.path
    if (!path || !projectStore.updateItem(path, mechanicCategorySchema, next)) return { ok: false, reason: 'read-only' }
    categoryDocs.value = new Map(categoryDocs.value).set(id, next)
    if (name !== cat.name)
      projectStore.setMechanicRefs({
        mechanicCategories: p.manifest.mechanicCategories.map((r) => (r.id === id ? { ...r, title: name } : r)),
      })
    rebuildEntries()
    return { ok: true }
  }

  /** What deleting would do (for the confirm dialog): mechanics to move, or why it is refused. */
  const planDeleteCategory = (id: string, targetId?: string | null): DeleteCategoryPlan =>
    deleteCategoryPlan(
      categories.value.map((c) => c.id),
      mechanics.value,
      id,
      targetId,
    )

  /** Moves the category's mechanics to `targetId` (required when it has any), then removes the category file. */
  async function deleteCategory(id: string, targetId?: string | null): Promise<DeleteCategoryOutcome> {
    const p = projectStore.project
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    const plan = planDeleteCategory(id, targetId)
    if (!plan.ok) return plan
    const path = categoryEntries.value.find((e) => e.id === id)?.path
    if (!path) return { ok: false, reason: 'unknown-category' }
    if (plan.targetId) {
      const moved = reassignMechanics(mechanics.value, id, plan.targetId).filter((m) => plan.reassign.includes(m.id))
      if (!moved.every(commit)) return { ok: false, reason: 'unknown' }
    }
    const next = new Map(categoryDocs.value)
    next.delete(id)
    categoryDocs.value = next
    statuses.delete(id)
    projectStore.setMechanicRefs({
      mechanicCategories: p.manifest.mechanicCategories.filter((r) => r.id !== id),
    })
    if (filter.value.categoryId === id) setCategoryFilter(null)
    rebuildEntries()
    try {
      await projectStore.flush() // mechanics and the manifest are saved before the file goes
      await projectStore.removeUnlistedFile(path)
    } catch (e) {
      console.error('Could not remove the category file', e)
      return { ok: false, reason: 'unknown' }
    }
    return { ok: true, moved: plan.reassign.length }
  }

  return {
    readOnly,
    mechanics,
    categories,
    mechanicEntries,
    categoryEntries,
    selectedId,
    selected,
    allTags,
    filter,
    filterActive,
    filteredMechanics,
    trashedMechanics,
    load,
    reset,
    select,
    setCategoryFilter,
    setStatusFilter,
    setQuery,
    toggleTag,
    clearFilter,
    createMechanic,
    updateMechanic,
    addLink,
    removeLink,
    moveMechanic,
    deleteMechanic,
    restoreMechanic,
    createCategory,
    updateCategory,
    planDeleteCategory,
    deleteCategory,
  }
})
