import { AREAS, type Area, type IndexedItem, type ItemKind, type SearchIndex } from './index'
import { fold, foldMapped, originalRange } from './normalize'

export interface SearchHit {
  area: Area
  kind: ItemKind
  id: string
  /** Title of the item. */
  title: string
  /** Where the text matched. */
  field: 'title' | 'alias' | 'body'
  /** The matching title, alias or body excerpt. */
  snippet: string
  /** Match range inside `snippet` (end exclusive). */
  matchStart: number
  matchEnd: number
  /** Manuscript body hits: the block to open at. */
  blockId?: string
  /** Conversation body hits: the graph node to select. */
  nodeId?: string
  /** The scene's chapter or the node's timeline. */
  parentId?: string
}

export interface SearchGroup {
  area: Area
  hits: SearchHit[]
  /** Matches beyond the cap. */
  more: number
}

export interface SearchResults {
  groups: SearchGroup[]
}

export interface SearchOptions {
  /** Hits shown per area. Default 50. */
  limit?: number
}

const BEFORE = 40
const AFTER = 80

function snippetOf(text: string, start: number, end: number) {
  const from = Math.max(0, start - BEFORE)
  const to = Math.min(text.length, end + AFTER)
  const lead = from > 0 ? '…' : ''
  return {
    snippet: lead + text.slice(from, to) + (to < text.length ? '…' : ''),
    matchStart: lead.length + start - from,
    matchEnd: lead.length + end - from,
  }
}

function locate(text: string, qf: string, foldedAt: number) {
  const m = foldMapped(text)
  return originalRange(text, m, foldedAt, foldedAt + qf.length)
}

/** First match of the item (title, then aliases, then body in document order), or null. */
function hitOf(item: IndexedItem, qf: string): SearchHit | null {
  const base = { area: item.area, kind: item.kind, id: item.id, title: item.title }
  const parent = item.parentId ? { parentId: item.parentId } : {}
  let at = item.titleFolded.indexOf(qf)
  if (at >= 0) {
    const r = locate(item.title, qf, at)
    return { ...base, ...parent, field: 'title', snippet: item.title, matchStart: r.start, matchEnd: r.end }
  }
  for (let i = 0; i < item.aliases.length; i++) {
    at = item.aliasesFolded[i].indexOf(qf)
    if (at < 0) continue
    const r = locate(item.aliases[i], qf, at)
    return { ...base, ...parent, field: 'alias', snippet: item.aliases[i], matchStart: r.start, matchEnd: r.end }
  }
  for (const part of item.parts ?? []) {
    at = part.folded.indexOf(qf)
    if (at < 0) continue
    const r = locate(part.text, qf, at)
    return {
      ...base,
      ...parent,
      field: 'body',
      ...snippetOf(part.text, r.start, r.end),
      ...(part.blockId ? { blockId: part.blockId } : {}),
      ...(part.nodeId ? { nodeId: part.nodeId } : {}),
    }
  }
  return null
}

/** Substring search over titles, aliases and bodies; one hit per item, grouped by area. */
export function search(index: SearchIndex, text: string, opts: SearchOptions = {}): SearchResults {
  const qf = fold(text.trim())
  if (qf === '') return { groups: [] }
  const limit = opts.limit ?? 50
  const groups: SearchGroup[] = []
  for (const area of AREAS) {
    const titled: SearchHit[] = []
    const bodied: SearchHit[] = []
    for (const item of index.items(area)) {
      const h = hitOf(item, qf)
      if (h) (h.field === 'body' ? bodied : titled).push(h)
    }
    const all = [...titled, ...bodied]
    if (all.length > 0) groups.push({ area, hits: all.slice(0, limit), more: Math.max(0, all.length - limit) })
  }
  return { groups }
}
