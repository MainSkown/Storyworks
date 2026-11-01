export interface RuleLike {
  id: string
  title: string
  categoryId: string
  tags: readonly string[]
}
export interface CategoryLike {
  id: string
  name: string
}

export type NodeRule<R extends RuleLike = RuleLike> =
  | { id: string; missing: false; rule: R; categoryName: string | null }
  | { id: string; missing: true }

/** A node's rule ids, in node order, each resolved to its rule or marked missing. */
export function resolveNodeRules<R extends RuleLike>(
  ruleIds: readonly string[],
  rules: readonly R[],
  categories: readonly CategoryLike[],
): NodeRule<R>[] {
  const byId = new Map(rules.map((r) => [r.id, r]))
  return ruleIds.map((id) => {
    const rule = byId.get(id)
    if (!rule) return { id, missing: true as const }
    const categoryName = categories.find((c) => c.id === rule.categoryId)?.name ?? null
    return { id, missing: false as const, rule, categoryName }
  })
}

/** The id list with `id` added once. */
export const addRuleId = (ids: readonly string[], id: string): string[] =>
  ids.includes(id) ? [...ids] : [...ids, id]

export interface PickerRuleGroup<R extends RuleLike = RuleLike> {
  categoryId: string | null
  name: string
  rules: R[]
}

/** Rules matching every word of `query` (title, tags, category), not yet linked, grouped by category; empty groups left out. */
export function groupPickerRules<R extends RuleLike>(
  rules: readonly R[],
  categories: readonly CategoryLike[],
  query: string,
  linked: readonly string[],
): PickerRuleGroup<R>[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const skip = new Set(linked)
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const groups: PickerRuleGroup<R>[] = categories.map((c) => ({ categoryId: c.id, name: c.name, rules: [] }))
  const orphans: PickerRuleGroup<R> = { categoryId: null, name: '', rules: [] }
  for (const r of rules) {
    if (skip.has(r.id)) continue
    const hay = [r.title, ...r.tags, names.get(r.categoryId) ?? ''].join('\n').toLowerCase()
    if (!words.every((w) => hay.includes(w))) continue
    ;(groups.find((g) => g.categoryId === r.categoryId) ?? orphans).rules.push(r)
  }
  return [...groups, orphans].filter((g) => g.rules.length)
}
