import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { newId } from '../project/ids'
import {
  brokenRuleLinks,
  deleteCategoryPlan,
  filterRules,
  loadRuleCategories,
  loadRules,
  reassignRules,
  ruleCategoryPath,
  rulePath,
  usedIn as scanUsedIn,
  type BrokenRuleLink,
  type DeleteCategoryPlan,
  type ItemStatus,
  type RuleFilter,
  type RuleUsage,
} from '../project/rules'
import { RULE_VERSION, ruleSchema, type Rule } from '../project/schemas/rule'
import {
  RULE_CATEGORY_VERSION,
  ruleCategorySchema,
  type RuleCategory,
} from '../project/schemas/ruleCategory'
import { parseFile } from '../project/serialize'
import { useProjectStore } from '../project/store'
import type { FileError } from '../project/types'
import { useTimelinesStore } from '../timeline/store'

/** One listed file, in manifest order. `status` is not 'ok' for files the UI shows as "invalid file" / "missing". */
export interface ListEntry {
  id: string
  path: string
  title: string
  status: ItemStatus
  error?: FileError
}

export type RulePatch = Partial<Pick<Rule, 'title' | 'categoryId' | 'description' | 'tags' | 'exceptions'>>
export type CategoryPatch = Partial<Pick<RuleCategory, 'name' | 'color'>>

export type RuleOutcome =
  | { ok: true }
  | { ok: false; reason: 'read-only' | 'unknown-rule' | 'unknown-category' }
export type CategoryOutcome =
  | { ok: true }
  | { ok: false; reason: 'read-only' | 'unknown-category' | 'empty-name' }
export type DeleteCategoryOutcome =
  | { ok: true; moved: number }
  | { ok: false; reason: 'read-only' | Extract<DeleteCategoryPlan, { ok: false }>['reason'] | 'unknown' }

export interface RuleGroup {
  /** null = rules whose category is no longer listed */
  category: RuleCategory | null
  rules: Rule[]
}

const DEFAULT_COLOR = '#6b7280'
const EMPTY_FILTER = (): Required<RuleFilter> => ({ categoryId: null, tags: [], query: '' })

const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim()).filter(Boolean))]

export const useRulesStore = defineStore('rules', () => {
  const projectStore = useProjectStore()
  const timelines = useTimelinesStore()

  const ruleDocs = shallowRef(new Map<string, Rule>())
  const categoryDocs = shallowRef(new Map<string, RuleCategory>())
  const ruleEntries = shallowRef<ListEntry[]>([])
  const categoryEntries = shallowRef<ListEntry[]>([])
  const selectedId = ref<string | null>(null)
  const filter = ref<Required<RuleFilter>>(EMPTY_FILTER())
  const statuses = new Map<string, { status: ItemStatus; error?: FileError }>()
  const seen = new Map<string, number>()

  const readOnly = computed(() => projectStore.readOnly)
  /** Readable rules in manifest order. */
  const rules = computed(() => [...ruleDocs.value.values()])
  /** Readable categories in manifest order. */
  const categories = computed(() => [...categoryDocs.value.values()])
  const selected = computed(() => (selectedId.value ? (ruleDocs.value.get(selectedId.value) ?? null) : null))
  const allTags = computed(() => [...new Set(rules.value.flatMap((r) => r.tags))].sort())
  const filterActive = computed(
    () => !!filter.value.categoryId || filter.value.tags.length > 0 || filter.value.query.trim() !== '',
  )
  const filteredRules = computed(() => filterRules(rules.value, filter.value))
  /** Filtered rules grouped by category, in category order; empty groups included. */
  const groups = computed<RuleGroup[]>(() => {
    const out: RuleGroup[] = categories.value.map((category) => ({ category, rules: [] }))
    const orphans: RuleGroup = { category: null, rules: [] }
    for (const r of filteredRules.value)
      (out.find((g) => g.category?.id === r.categoryId) ?? orphans).rules.push(r)
    return orphans.rules.length ? [...out, orphans] : out
  })
  /** Rules in the trash, for the Trash dialog (the same entries are in the project store's `trash`). */
  const trashedRules = computed(() => projectStore.trash.filter((t) => t.type === 'rule'))
  /** Node links pointing at a rule that is not listed (deleted, trashed). */
  const brokenLinks = computed<BrokenRuleLink[]>(() =>
    brokenRuleLinks(timelines.loadedTimelines, new Set(ruleEntries.value.map((e) => e.id))),
  )

  // ---- loading ----

  function rebuildEntries(): void {
    const m = projectStore.project?.manifest
    const entry = (r: { id: string; path: string; title?: string }): ListEntry => {
      const st = statuses.get(r.id) ?? { status: 'ok' as const }
      return { id: r.id, path: r.path, title: r.title ?? '', status: st.status, ...(st.error ? { error: st.error } : {}) }
    }
    ruleEntries.value = (m?.rules ?? []).map(entry)
    categoryEntries.value = (m?.ruleCategories ?? []).map(entry)
  }

  function reseedVersions(): void {
    seen.clear()
    for (const e of [...ruleEntries.value, ...categoryEntries.value])
      seen.set(e.path, projectStore.itemVersion(e.path))
  }

  function ensureSelection(): void {
    if (selectedId.value && !ruleDocs.value.has(selectedId.value)) selectedId.value = null
    if (filter.value.categoryId && !categoryDocs.value.has(filter.value.categoryId))
      filter.value = { ...filter.value, categoryId: null }
  }

  /** Reads everything again (after open, or after project.json was reloaded). */
  async function load(): Promise<void> {
    const p = projectStore.project
    if (!p) return reset()
    const [r, c] = await Promise.all([loadRules(p), loadRuleCategories(p)])
    ruleDocs.value = r.items
    categoryDocs.value = c.items
    statuses.clear()
    for (const l of [r, c])
      for (const [id, status] of l.status) statuses.set(id, { status, error: l.errors.get(id) })
    rebuildEntries()
    ensureSelection()
    reseedVersions()
  }

  function reset(): void {
    ruleDocs.value = new Map()
    categoryDocs.value = new Map()
    ruleEntries.value = []
    categoryEntries.value = []
    statuses.clear()
    seen.clear()
    selectedId.value = null
    filter.value = EMPTY_FILTER()
  }

  async function rereadOne(kind: 'rule' | 'category', id: string, path: string): Promise<void> {
    const p = projectStore.project
    if (!p) return
    const text = await p.io.readText(path)
    const schema = kind === 'rule' ? ruleSchema : ruleCategorySchema
    const r = text === null ? null : parseFile<{ id: string }>(schema, text, path)
    const docs = new Map<string, Rule | RuleCategory>(kind === 'rule' ? ruleDocs.value : categoryDocs.value)
    if (r?.ok && r.value.id === id) {
      docs.set(id, r.value as Rule & RuleCategory)
      statuses.set(id, { status: 'ok' })
    } else {
      docs.delete(id)
      statuses.set(
        id,
        r
          ? { status: 'invalid', error: r.ok ? { file: path, field: 'id', message: 'id does not match project.json' } : r.error }
          : { status: 'missing' },
      )
    }
    // keep manifest order
    const refs = kind === 'rule' ? p.manifest.rules : p.manifest.ruleCategories
    const ordered = new Map(refs.flatMap((ref) => (docs.has(ref.id) ? [[ref.id, docs.get(ref.id)!] as const] : [])))
    if (kind === 'rule') ruleDocs.value = ordered as Map<string, Rule>
    else categoryDocs.value = ordered as Map<string, RuleCategory>
    rebuildEntries()
    ensureSelection()
  }

  // Files changed on disk (the project store reloads them and bumps their version).
  watch(
    () => [
      ...ruleEntries.value.map((e) => ['rule', e.id, e.path, projectStore.itemVersion(e.path)] as const),
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
    if (id !== null && !ruleDocs.value.has(id)) return
    selectedId.value = id
  }
  const setCategoryFilter = (categoryId: string | null) => {
    filter.value = { ...filter.value, categoryId }
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

  // ---- rules ----

  /** Node links to a rule (all timelines). */
  const usedIn = (ruleId: string): RuleUsage[] => scanUsedIn(timelines.loadedTimelines, ruleId)

  /** Records the value for autosave and shows it. false = refused (read-only, invalid file). */
  function commitRule(next: Rule): boolean {
    const path = ruleEntries.value.find((e) => e.id === next.id)?.path
    if (!path || !projectStore.updateItem(path, ruleSchema, next)) return false
    ruleDocs.value = new Map(ruleDocs.value).set(next.id, next)
    return true
  }

  /** New rule at the end of the list (default category: the first); it becomes the selected one. null = refused. */
  async function createRule(o: { title?: string; categoryId?: string } = {}): Promise<string | null> {
    const p = projectStore.project
    if (!p || p.readOnly) return null
    const categoryId = o.categoryId ?? categories.value[0]?.id
    if (!categoryId || !categoryDocs.value.has(categoryId)) return null
    const rule = ruleSchema.parse({
      version: RULE_VERSION,
      id: newId(),
      title: o.title?.trim() ?? '',
      categoryId,
    })
    await p.saveItem(rulePath(rule.id), ruleSchema, rule)
    statuses.set(rule.id, { status: 'ok' })
    ruleDocs.value = new Map(ruleDocs.value).set(rule.id, rule)
    projectStore.setRuleRefs({
      rules: [...p.manifest.rules, { id: rule.id, path: rulePath(rule.id), title: rule.title }],
    })
    rebuildEntries()
    selectedId.value = rule.id
    return rule.id
  }

  function updateRule(id: string, patch: RulePatch): RuleOutcome {
    const p = projectStore.project
    const rule = ruleDocs.value.get(id)
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!rule) return { ok: false, reason: 'unknown-rule' }
    if (patch.categoryId !== undefined && !categoryDocs.value.has(patch.categoryId))
      return { ok: false, reason: 'unknown-category' }
    const next: Rule = {
      ...rule,
      ...patch,
      title: patch.title === undefined ? rule.title : patch.title.trim(),
      tags: patch.tags === undefined ? rule.tags : cleanTags(patch.tags),
    }
    if (!commitRule(next)) return { ok: false, reason: 'read-only' }
    if (next.title !== rule.title)
      projectStore.setRuleRefs({
        rules: p.manifest.rules.map((r) => (r.id === id ? { ...r, title: next.title } : r)),
      })
    rebuildEntries()
    return { ok: true }
  }

  /** Moves the rule (listed or invalid) to the trash. Node links stay and show as missing until restore. false = refused. */
  async function deleteRule(id: string): Promise<boolean> {
    const entry = ruleEntries.value.find((e) => e.id === id)
    if (!entry || projectStore.readOnly) return false
    await projectStore.trashRule(id, ruleDocs.value.get(id)?.title ?? entry.title)
    const next = new Map(ruleDocs.value)
    next.delete(id)
    ruleDocs.value = next
    statuses.delete(id)
    if (selectedId.value === id) selectedId.value = null
    rebuildEntries()
    reseedVersions()
    return true
  }

  /**
   * Puts a trashed rule back (also what the project store's restoreItem does for rule entries).
   * Throws RuleRestoreError; a rule whose category is gone moves to the first category.
   */
  async function restoreRule(id: string): Promise<void> {
    await projectStore.restoreRuleFile(id)
    await load()
    const rule = ruleDocs.value.get(id)
    const fallback = categories.value[0]
    if (rule && fallback && !categoryDocs.value.has(rule.categoryId))
      commitRule({ ...rule, categoryId: fallback.id })
  }

  // ---- categories ----

  /** New category at the end of the list. null = refused (read-only, empty name). */
  async function createCategory(name: string, color = DEFAULT_COLOR): Promise<string | null> {
    const p = projectStore.project
    const clean = name.trim()
    if (!p || p.readOnly || !clean) return null
    const cat: RuleCategory = { version: RULE_CATEGORY_VERSION, id: newId(), name: clean, color }
    const path = ruleCategoryPath(cat.id)
    await p.saveItem(path, ruleCategorySchema, cat)
    statuses.set(cat.id, { status: 'ok' })
    categoryDocs.value = new Map(categoryDocs.value).set(cat.id, cat)
    projectStore.setRuleRefs({ ruleCategories: [...p.manifest.ruleCategories, { id: cat.id, path, title: clean }] })
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
    const next: RuleCategory = { ...cat, ...patch, name }
    const path = categoryEntries.value.find((e) => e.id === id)?.path
    if (!path || !projectStore.updateItem(path, ruleCategorySchema, next)) return { ok: false, reason: 'read-only' }
    categoryDocs.value = new Map(categoryDocs.value).set(id, next)
    if (name !== cat.name)
      projectStore.setRuleRefs({
        ruleCategories: p.manifest.ruleCategories.map((r) => (r.id === id ? { ...r, title: name } : r)),
      })
    rebuildEntries()
    return { ok: true }
  }

  /** What deleting would do (for the confirm dialog): rules to move, or why it is refused. */
  const planDeleteCategory = (id: string, targetId?: string | null): DeleteCategoryPlan =>
    deleteCategoryPlan(
      categories.value.map((c) => c.id),
      rules.value,
      id,
      targetId,
    )

  /** Moves the category's rules to `targetId` (required when it has rules), then removes the category file. */
  async function deleteCategory(id: string, targetId?: string | null): Promise<DeleteCategoryOutcome> {
    const p = projectStore.project
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    const plan = planDeleteCategory(id, targetId)
    if (!plan.ok) return plan
    const path = categoryEntries.value.find((e) => e.id === id)?.path
    if (!path) return { ok: false, reason: 'unknown-category' }
    if (plan.targetId) {
      const moved = reassignRules(rules.value, id, plan.targetId).filter((r) => plan.reassign.includes(r.id))
      if (!moved.every(commitRule)) return { ok: false, reason: 'unknown' }
    }
    const next = new Map(categoryDocs.value)
    next.delete(id)
    categoryDocs.value = next
    statuses.delete(id)
    projectStore.setRuleRefs({ ruleCategories: p.manifest.ruleCategories.filter((r) => r.id !== id) })
    if (filter.value.categoryId === id) setCategoryFilter(null)
    rebuildEntries()
    try {
      await projectStore.flush() // rules and the manifest are saved before the file goes
      await projectStore.removeUnlistedFile(path)
    } catch (e) {
      console.error('Could not remove the category file', e)
      return { ok: false, reason: 'unknown' }
    }
    return { ok: true, moved: plan.reassign.length }
  }

  return {
    readOnly,
    rules,
    categories,
    ruleEntries,
    categoryEntries,
    selectedId,
    selected,
    allTags,
    filter,
    filterActive,
    filteredRules,
    groups,
    trashedRules,
    brokenLinks,
    load,
    reset,
    select,
    setCategoryFilter,
    setQuery,
    toggleTag,
    clearFilter,
    usedIn,
    createRule,
    updateRule,
    deleteRule,
    restoreRule,
    createCategory,
    updateCategory,
    planDeleteCategory,
    deleteCategory,
  }
})
