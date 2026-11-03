import { blockTexts } from '../codex/mentions'
import { docToText } from '../project/plainText'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { CodexEntry } from '../project/schemas/codexEntry'
import type { KnowledgeItem } from '../project/schemas/knowledge'
import type { Rule } from '../project/schemas/rule'
import type { Timeline } from '../timeline/schema'
import { createIndex, type Area, type IndexInput, type IndexPart, type SearchIndex } from './index'

type Doc = Record<string, unknown>
const asDoc = (d: unknown): Doc => (typeof d === 'object' && d !== null ? (d as Doc) : {})

/** Plain text lines of a rich-text field (one per top-level block), without block ids. */
export function docParts(doc: unknown): IndexPart[] {
  return docToText(asDoc(doc))
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((text) => ({ text }))
}

const textParts = (...texts: string[]): IndexPart[] =>
  texts.filter((t) => t.trim() !== '').map((text) => ({ text }))

/** Scene body: one part per text block with its id; falls back to plain lines when blocks have no ids. */
export function sceneParts(content: unknown): IndexPart[] {
  const blocks = blockTexts(content).filter((b) => b.text.trim() !== '')
  if (blocks.length > 0) return blocks.map((b) => ({ text: b.text, blockId: b.blockId }))
  return docParts(content)
}

export interface ItemEntry {
  area: Area
  item: IndexInput
}

/** Chapters and scenes in tree order. Scene bodies come from `content` when given, else stay pending. */
export function manuscriptItems(
  tree: ManuscriptNode[],
  content?: ReadonlyMap<string, unknown>,
): ItemEntry[] {
  const out: ItemEntry[] = []
  const walk = (nodes: ManuscriptNode[], parentId?: string) => {
    for (const n of nodes) {
      if (n.type === 'scene') {
        const c = content?.get(n.id)
        out.push({
          area: 'manuscript',
          item: {
            id: n.id,
            kind: 'scene',
            title: n.title,
            parentId,
            ...(c !== undefined ? { parts: sceneParts(c) } : {}),
          },
        })
      } else if (n.type === 'chapter') {
        out.push({ area: 'manuscript', item: { id: n.id, kind: 'chapter', title: n.title, parentId } })
      }
      walk(n.children, n.id)
    }
  }
  walk(tree)
  return out
}

export const ruleItem = (r: Pick<Rule, 'id' | 'title' | 'description' | 'exceptions'>): ItemEntry => ({
  area: 'rules',
  item: {
    id: r.id,
    kind: 'rule',
    title: r.title,
    parts: [...docParts(r.description), ...docParts(r.exceptions)],
  },
})

export const entryItem = (
  e: Pick<CodexEntry, 'id' | 'name' | 'aliases' | 'notes' | 'appendixText'>,
): ItemEntry => ({
  area: 'codex',
  item: {
    id: e.id,
    kind: 'entry',
    title: e.name,
    aliases: e.aliases,
    parts: [...docParts(e.notes), ...textParts(e.appendixText)],
  },
})

export const knowledgeItem = (
  k: Pick<KnowledgeItem, 'id' | 'title' | 'description'> & { learnings: { note: string }[] },
): ItemEntry => ({
  area: 'knowledge',
  item: {
    id: k.id,
    kind: 'knowledge',
    title: k.title,
    parts: [...docParts(k.description), ...textParts(...k.learnings.map((l) => l.note))],
  },
})

type TimelineLike = Pick<Timeline, 'id' | 'name'> & {
  nodes: { id: string; title: string; description: unknown }[]
}

/** The timeline (title only) followed by its nodes. */
export function timelineItems(t: TimelineLike): ItemEntry[] {
  return [
    { area: 'timelines', item: { id: t.id, kind: 'timeline', title: t.name, parts: [] } },
    ...t.nodes.map((n) => ({
      area: 'timelines' as const,
      item: {
        id: n.id,
        kind: 'node' as const,
        title: n.title,
        parentId: t.id,
        parts: docParts(n.description),
      },
    })),
  ]
}

export interface SearchSources {
  tree: ManuscriptNode[]
  /** Scene id -> ProseMirror body, for scenes already loaded; the rest are indexed by title until `loadBodies`. */
  sceneContent?: ReadonlyMap<string, unknown>
  rules: Pick<Rule, 'id' | 'title' | 'description' | 'exceptions'>[]
  timelines: TimelineLike[]
  entries: Pick<CodexEntry, 'id' | 'name' | 'aliases' | 'notes' | 'appendixText'>[]
  knowledge: Parameters<typeof knowledgeItem>[0][]
}

/** Builds the whole index from what is listed (trashed items are simply not passed). */
export function buildIndex(src: SearchSources): SearchIndex {
  const ix = createIndex()
  const all = [
    ...manuscriptItems(src.tree, src.sceneContent),
    ...src.rules.map(ruleItem),
    ...src.timelines.flatMap(timelineItems),
    ...src.entries.map(entryItem),
    ...src.knowledge.map(knowledgeItem),
  ]
  for (const { area, item } of all) ix.upsert(area, item)
  return ix
}

export interface LoadBodiesOptions {
  /** Scenes loaded between pauses. Default 20. */
  chunk?: number
  /** Called between chunks so the UI stays responsive. Default: a macrotask. */
  pause?: () => Promise<void>
  isCancelled?: () => boolean
}

const macrotask = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * Background pass: loads the body of every scene that has none yet. A body that was set
 * meanwhile (an edit) is not overwritten. Returns how many scenes were filled.
 */
export async function loadBodies(
  index: SearchIndex,
  load: (sceneId: string) => Promise<unknown | null>,
  opts: LoadBodiesOptions = {},
): Promise<number> {
  const chunk = opts.chunk ?? 20
  const pause = opts.pause ?? macrotask
  let filled = 0
  let n = 0
  for (const id of index.pendingBodies()) {
    if (opts.isCancelled?.()) break
    const content = await load(id)
    if (content !== null && index.get(id)?.parts === null) {
      index.setParts(id, sceneParts(content))
      filled++
    }
    if (++n % chunk === 0) await pause()
  }
  return filled
}
