import type { Timeline } from '../timeline/schema'
import { docToText } from './plainText'
import {
  RULE_CATEGORY_VERSION,
  ruleCategorySchema,
  type RuleCategory,
} from './schemas/ruleCategory'
import { ruleSchema, type Rule } from './schemas/rule'
import { parseFile } from './serialize'
import type { Env, FileError, OpenProject } from './types'
import type { z } from 'zod'

export const rulePath = (id: string) => `rules/${id}.json`
export const ruleCategoryPath = (id: string) => `rules/categories/${id}.json`

export const DEFAULT_RULE_CATEGORIES: readonly { name: string; color: string }[] = [
  { name: 'Magic', color: '#8b5cf6' },
  { name: 'Physics', color: '#3b82f6' },
  { name: 'Society', color: '#f59e0b' },
  { name: 'Technology', color: '#14b8a6' },
  { name: 'Religion', color: '#ef4444' },
]

// ---- loading ----

export type ItemStatus = 'ok' | 'missing' | 'invalid'

export interface LoadedList<T> {
  /** Only files that read and validated, in manifest order. */
  items: Map<string, T>
  status: Map<string, ItemStatus>
  errors: Map<string, FileError>
}

/** Reads every listed file; one bad file never blocks the others. The file must carry its listed id. */
export async function loadList<T extends { id: string }>(
  project: OpenProject,
  refs: readonly { id: string; path: string }[],
  schema: z.ZodType<T>,
): Promise<LoadedList<T>> {
  const out: LoadedList<T> = { items: new Map(), status: new Map(), errors: new Map() }
  const read = await Promise.all(
    refs.map(async (ref) => {
      const text = await project.io.readText(ref.path)
      return [ref, text === null ? null : parseFile(schema, text, ref.path)] as const
    }),
  )
  for (const [ref, r] of read) {
    if (r === null) out.status.set(ref.id, 'missing')
    else if (r.ok && r.value.id === ref.id) {
      out.items.set(ref.id, r.value)
      out.status.set(ref.id, 'ok')
    } else {
      out.status.set(ref.id, 'invalid')
      out.errors.set(
        ref.id,
        r.ok
          ? {
              file: ref.path,
              field: 'id',
              message: `id "${r.value.id}" does not match "${ref.id}" in project.json`,
            }
          : r.error,
      )
    }
  }
  return out
}

export const loadRules = (project: OpenProject) =>
  loadList(project, project.manifest.rules, ruleSchema)
export const loadRuleCategories = (project: OpenProject) =>
  loadList(project, project.manifest.ruleCategories, ruleCategorySchema)

// ---- search and filter ----

export interface RuleFilter {
  categoryId?: string | null
  /** A rule must carry every listed tag. */
  tags?: string[]
  /** Case-insensitive; matches title, tags and the plain text of description and exceptions. */
  query?: string
}

const text = (doc: Rule['description']) => docToText(doc).toLowerCase()

export function filterRules(rules: readonly Rule[], f: RuleFilter): Rule[] {
  const q = (f.query ?? '').trim().toLowerCase()
  const tags = f.tags ?? []
  return rules.filter((r) => {
    if (f.categoryId && r.categoryId !== f.categoryId) return false
    if (!tags.every((t) => r.tags.includes(t))) return false
    if (!q) return true
    return (
      r.title.toLowerCase().includes(q) ||
      r.tags.some((t) => t.toLowerCase().includes(q)) ||
      text(r.description).includes(q) ||
      text(r.exceptions).includes(q)
    )
  })
}

// ---- categories ----

export type DeleteCategoryPlan =
  | { ok: true; reassign: string[]; targetId: string | null }
  | { ok: false; reason: 'unknown-category' | 'last-category' | 'target-required' | 'bad-target' }

/** What deleting a category involves: which rules move where. Pure; deletes nothing. */
export function deleteCategoryPlan(
  categoryIds: readonly string[],
  rules: readonly Pick<Rule, 'id' | 'categoryId'>[],
  categoryId: string,
  targetId?: string | null,
): DeleteCategoryPlan {
  if (!categoryIds.includes(categoryId)) return { ok: false, reason: 'unknown-category' }
  if (categoryIds.length <= 1) return { ok: false, reason: 'last-category' }
  const reassign = rules.filter((r) => r.categoryId === categoryId).map((r) => r.id)
  if (reassign.length === 0) return { ok: true, reassign, targetId: null }
  if (!targetId) return { ok: false, reason: 'target-required' }
  if (targetId === categoryId || !categoryIds.includes(targetId))
    return { ok: false, reason: 'bad-target' }
  return { ok: true, reassign, targetId }
}

export function reassignRules(rules: readonly Rule[], from: string, to: string): Rule[] {
  return rules.map((r) => (r.categoryId === from ? { ...r, categoryId: to } : r))
}

/**
 * First-open defaults: five categories, only when the book has no categories and no rules
 * (so deleting them all on a book with rules does not bring them back). Idempotent; does
 * nothing when read-only. Saves right away.
 */
export async function seedRuleCategories(project: OpenProject, env: Env): Promise<void> {
  if (project.readOnly) return
  const { manifest } = project
  if (manifest.ruleCategories.length > 0 || manifest.rules.length > 0) return
  const written: string[] = []
  const before = manifest.ruleCategories
  try {
    const refs = []
    for (const { name, color } of DEFAULT_RULE_CATEGORIES) {
      const cat: RuleCategory = { version: RULE_CATEGORY_VERSION, id: env.newId(), name, color }
      const path = ruleCategoryPath(cat.id)
      await project.saveItem(path, ruleCategorySchema, cat)
      written.push(path)
      refs.push({ id: cat.id, path, title: name })
    }
    manifest.ruleCategories = refs
    await project.saveManifest()
  } catch (e) {
    manifest.ruleCategories = before
    await Promise.all(written.map((p) => project.io.remove(p).catch(() => {})))
    throw e
  }
}

// ---- node links (stored on the node as `ruleIds`) ----

export interface RuleUsage {
  timelineId: string
  timelineName: string
  nodeId: string
  nodeTitle: string
}

/** Nodes (in any timeline) that list the rule. */
export function usedIn(timelines: readonly Timeline[], ruleId: string): RuleUsage[] {
  return timelines.flatMap((t) =>
    t.nodes
      .filter((n) => n.ruleIds.includes(ruleId))
      .map((n) => ({
        timelineId: t.id,
        timelineName: t.name,
        nodeId: n.id,
        nodeTitle: n.title,
      })),
  )
}

export interface BrokenRuleLink {
  timelineId: string
  nodeId: string
  ruleId: string
}

/** Node rule ids that point at no listed rule (deleted, trashed or never existed). */
export function brokenRuleLinks(
  timelines: readonly Timeline[],
  liveRuleIds: ReadonlySet<string>,
): BrokenRuleLink[] {
  return timelines.flatMap((t) =>
    t.nodes.flatMap((n) =>
      n.ruleIds
        .filter((id) => !liveRuleIds.has(id))
        .map((ruleId) => ({ timelineId: t.id, nodeId: n.id, ruleId })),
    ),
  )
}
