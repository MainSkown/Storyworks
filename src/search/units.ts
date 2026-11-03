import type { ManuscriptNode } from '../project/schemas/manifest'
import {
  entryItem,
  glossaryItem,
  knowledgeItem,
  manuscriptItems,
  mechanicItem,
  OVERVIEW_ID,
  overviewItem,
  ruleItem,
  timelineItems,
  type GameDocSources,
  type SearchSources,
} from './build'
import type { Unit } from './sync'

/** Chapters and scenes in tree order; scene bodies stay as they are in the index. */
export const manuscriptUnits = (tree: ManuscriptNode[]): Unit[] =>
  manuscriptItems(tree).map(({ item }) => ({
    id: item.id,
    deps: [item.kind, item.title, item.parentId],
    make: () => item,
  }))

// Store records are replaced (never edited) on change, so the record itself is the dependency.
export const ruleUnits = (rules: SearchSources['rules']): Unit[] =>
  rules.map((r) => ({ id: r.id, deps: [r], make: () => ruleItem(r).item }))

export const mechanicUnits = (mechanics: GameDocSources['mechanics']): Unit[] =>
  mechanics.map((m) => ({ id: m.id, deps: [m], make: () => mechanicItem(m).item }))

export const glossaryUnits = (entries: GameDocSources['glossary']): Unit[] =>
  entries.map((e) => ({ id: e.id, deps: [e], make: () => glossaryItem(e).item }))

/** Always one unit when the page is readable; `title` is the translated name shown in results. */
export const overviewUnits = (content: unknown, title: string): Unit[] => [
  { id: OVERVIEW_ID, deps: [content, title], make: () => overviewItem(content, title).item },
]

export const entryUnits = (entries: SearchSources['entries']): Unit[] =>
  entries.map((e) => ({ id: e.id, deps: [e], make: () => entryItem(e).item }))

export const knowledgeUnits = (items: SearchSources['knowledge']): Unit[] =>
  items.map((k) => ({ id: k.id, deps: [k], make: () => knowledgeItem(k).item }))

/** Each timeline, then its nodes. A node is rebuilt only when its own record changes. */
export const timelineUnits = (timelines: SearchSources['timelines']): Unit[] =>
  timelines.flatMap((t) => [
    {
      id: t.id,
      deps: [t.name],
      make: () => timelineItems({ id: t.id, name: t.name, nodes: [] })[0]!.item,
    },
    ...t.nodes.map((n) => ({
      id: n.id,
      deps: [n, t.id, t.name],
      make: () => timelineItems({ id: t.id, name: t.name, nodes: [n] })[1]!.item,
    })),
  ])
