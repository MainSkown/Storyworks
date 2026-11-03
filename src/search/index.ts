import { fold } from './normalize'

export type Area = 'manuscript' | 'rules' | 'timelines' | 'codex' | 'knowledge'
export const AREAS: Area[] = ['manuscript', 'codex', 'rules', 'timelines', 'knowledge']

export type ItemKind = 'scene' | 'conversation' | 'chapter' | 'rule' | 'entry' | 'knowledge' | 'timeline' | 'node'

export interface IndexPart {
  text: string
  /** Manuscript: the block the text sits in. */
  blockId?: string
  /** Conversations: the graph node the text sits in. */
  nodeId?: string
}

export interface IndexInput {
  id: string
  kind: ItemKind
  title: string
  aliases?: string[]
  /** Body text in document order. Omitted = keep what is there (or "not loaded yet" for a new item). */
  parts?: IndexPart[]
  /** Container: the chapter of a scene, the timeline of a node. Removing the parent removes the child. */
  parentId?: string
}

export interface IndexedPart extends IndexPart {
  folded: string
}

export interface IndexedItem {
  id: string
  area: Area
  kind: ItemKind
  title: string
  titleFolded: string
  aliases: string[]
  aliasesFolded: string[]
  /** null = body not loaded yet. */
  parts: IndexedPart[] | null
  parentId: string | null
}

export const indexPart = (p: IndexPart): IndexedPart => ({ ...p, folded: fold(p.text) })

export interface SearchIndex {
  /** Adds the item, or replaces it in place (keeps its position). */
  upsert(area: Area, item: IndexInput): void
  /** Removes the item and everything under it. */
  remove(id: string): void
  /** Puts the listed ids first, in that order; others keep their relative order after them. */
  reorder(area: Area, ids: string[]): void
  /** Sets the body of an existing item. */
  setParts(id: string, parts: IndexPart[]): void
  has(id: string): boolean
  get(id: string): IndexedItem | undefined
  /** Items of an area in document order. */
  items(area: Area): IndexedItem[]
  /** Items whose body has not been loaded (manuscript scenes and conversations still waiting). */
  pendingBodies(): string[]
}

export function createIndex(): SearchIndex {
  const areas = new Map<Area, Map<string, IndexedItem>>(AREAS.map((a) => [a, new Map()]))
  const where = new Map<string, Area>()
  const children = new Map<string, Set<string>>()

  const unlink = (item: IndexedItem) => {
    if (item.parentId) children.get(item.parentId)?.delete(item.id)
  }

  function remove(id: string): void {
    const area = where.get(id)
    if (!area) return
    const item = areas.get(area)!.get(id)!
    unlink(item)
    areas.get(area)!.delete(id)
    where.delete(id)
    const kids = children.get(id)
    children.delete(id)
    kids?.forEach(remove)
  }

  return {
    upsert(area, input) {
      const prevArea = where.get(input.id)
      const prev = prevArea ? areas.get(prevArea)!.get(input.id) : undefined
      let parts: IndexedPart[] | null = null
      if (input.parts) parts = input.parts.map(indexPart)
      else if (prev && prev.kind === input.kind) parts = prev.parts
      const aliases = input.aliases ?? []
      const item: IndexedItem = {
        id: input.id,
        area,
        kind: input.kind,
        title: input.title,
        titleFolded: fold(input.title),
        aliases,
        aliasesFolded: aliases.map(fold),
        parts,
        parentId: input.parentId ?? null,
      }
      if (prev) {
        unlink(prev)
        if (prevArea !== area) areas.get(prevArea!)!.delete(input.id)
      }
      areas.get(area)!.set(input.id, item)
      where.set(input.id, area)
      if (item.parentId) {
        const set = children.get(item.parentId) ?? new Set()
        set.add(item.id)
        children.set(item.parentId, set)
      }
    },
    remove,
    reorder(area, ids) {
      const map = areas.get(area)!
      const next = new Map<string, IndexedItem>()
      for (const id of ids) {
        const it = map.get(id)
        if (it) next.set(id, it)
      }
      for (const [id, it] of map) if (!next.has(id)) next.set(id, it)
      areas.set(area, next)
    },
    setParts(id, parts) {
      const area = where.get(id)
      const item = area && areas.get(area)!.get(id)
      if (item) item.parts = parts.map(indexPart)
    },
    has: (id) => where.has(id),
    get(id) {
      const area = where.get(id)
      return area ? areas.get(area)!.get(id) : undefined
    },
    items: (area) => [...areas.get(area)!.values()],
    pendingBodies() {
      const out: string[] = []
      for (const it of areas.get('manuscript')!.values())
        if ((it.kind === 'scene' || it.kind === 'conversation') && it.parts === null) out.push(it.id)
      return out
    },
  }
}
