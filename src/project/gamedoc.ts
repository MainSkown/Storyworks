import { defaultNames } from './defaultNames'
import { docToText } from './plainText'
import { loadList } from './rules'
import {
  GAME_OVERVIEW_FILE,
  GAME_OVERVIEW_VERSION,
  gameOverviewSchema,
  type GameOverview,
} from './schemas/gameOverview'
import type { GlossaryEntry } from './schemas/glossary'
import { mechanicSchema, type Mechanic, type MechanicStatus } from './schemas/mechanic'
import {
  MECHANIC_CATEGORY_VERSION,
  mechanicCategorySchema,
  type MechanicCategory,
} from './schemas/mechanicCategory'
import type { Env, OpenProject } from './types'

export const mechanicPath = (id: string) => `game-doc/mechanics/${id}.json`
export const mechanicCategoryPath = (id: string) => `game-doc/categories/${id}.json`

export const DEFAULT_MECHANIC_CATEGORIES: readonly { name: string; color: string }[] = [
  { name: 'Core loop', color: '#8b5cf6' },
  { name: 'Combat', color: '#ef4444' },
  { name: 'Economy', color: '#f59e0b' },
  { name: 'Progression', color: '#3b82f6' },
  { name: 'Exploration', color: '#14b8a6' },
  { name: 'Interface', color: '#64748b' },
]

export const loadMechanics = (project: OpenProject) =>
  loadList(project, project.manifest.mechanics, mechanicSchema)
export const loadMechanicCategories = (project: OpenProject) =>
  loadList(project, project.manifest.mechanicCategories, mechanicCategorySchema)

export interface MechanicFilter {
  categoryId?: string | null
  status?: MechanicStatus | null
  /** A mechanic must carry every listed tag. */
  tags?: string[]
  /** Case-insensitive; matches title, summary, tags, description text and parameters. */
  query?: string
}

export function filterMechanics(mechanics: readonly Mechanic[], f: MechanicFilter): Mechanic[] {
  const q = (f.query ?? '').trim().toLowerCase()
  const tags = f.tags ?? []
  return mechanics.filter((m) => {
    if (f.categoryId && m.categoryId !== f.categoryId) return false
    if (f.status && m.status !== f.status) return false
    if (!tags.every((t) => m.tags.includes(t))) return false
    if (!q) return true
    return (
      m.title.toLowerCase().includes(q) ||
      m.summary.toLowerCase().includes(q) ||
      m.tags.some((t) => t.toLowerCase().includes(q)) ||
      docToText(m.description).toLowerCase().includes(q) ||
      m.parameters.some((p) => p.name.toLowerCase().includes(q) || p.value.toLowerCase().includes(q))
    )
  })
}

export function reassignMechanics(mechanics: readonly Mechanic[], from: string, to: string): Mechanic[] {
  return mechanics.map((m) => (m.categoryId === from ? { ...m, categoryId: to } : m))
}

/** A to Z by term in the given language (stable for equal terms); does not change the input. */
export function sortGlossary(entries: readonly GlossaryEntry[], locale: string): GlossaryEntry[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base' })
  return [...entries].sort((a, b) => collator.compare(a.term.trim(), b.term.trim()))
}

// ---- first-open defaults ----

const heading = (text: string) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] })

/** The Overview page a game project starts with: four headings the user can edit or delete. */
export const starterOverview = (language: string): GameOverview => ({
  version: GAME_OVERVIEW_VERSION,
  content: {
    type: 'doc',
    content: defaultNames(language).overviewHeadings.flatMap((h) => [heading(h), { type: 'paragraph' }]),
  },
})

/**
 * First-open defaults for a game project: six categories (only when there are no categories and no
 * mechanics, so deleting them all does not bring them back) and the starter Overview (only when none
 * is listed). Idempotent; does nothing for other kinds or when read-only. Saves right away.
 */
export async function seedGameDocument(project: OpenProject, env: Env): Promise<void> {
  const { manifest } = project
  if (project.readOnly || manifest.kind !== 'game') return
  const written: string[] = []
  const before = { categories: manifest.mechanicCategories, overview: manifest.gameOverview }
  try {
    if (manifest.mechanicCategories.length === 0 && manifest.mechanics.length === 0) {
      const names = defaultNames(manifest.language).mechanicCategories
      const refs = []
      for (const [i, { color }] of DEFAULT_MECHANIC_CATEGORIES.entries()) {
        const cat: MechanicCategory = { version: MECHANIC_CATEGORY_VERSION, id: env.newId(), name: names[i], color }
        const path = mechanicCategoryPath(cat.id)
        await project.saveItem(path, mechanicCategorySchema, cat)
        written.push(path)
        refs.push({ id: cat.id, path, title: cat.name })
      }
      manifest.mechanicCategories = refs
    }
    if (!manifest.gameOverview) {
      await project.saveItem(GAME_OVERVIEW_FILE, gameOverviewSchema, starterOverview(manifest.language))
      written.push(GAME_OVERVIEW_FILE)
      manifest.gameOverview = { id: env.newId(), path: GAME_OVERVIEW_FILE, title: 'Overview' }
    }
    if (written.length > 0) await project.saveManifest()
  } catch (e) {
    manifest.mechanicCategories = before.categories
    manifest.gameOverview = before.overview
    await Promise.all(written.map((p) => project.io.remove(p).catch(() => {})))
    throw e
  }
}

/** Moves the item with `id` to `toIndex` (clamped); returns the same array when nothing moves. */
export function moveRef<T extends { id: string }>(list: readonly T[], id: string, toIndex: number): readonly T[] {
  const from = list.findIndex((x) => x.id === id)
  if (from < 0) return list
  const to = Math.max(0, Math.min(list.length - 1, toIndex))
  if (to === from) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
