import { blockTexts } from '../codex/mentions'
import { docToText } from '../project/plainText'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { Conversation } from '../project/schemas/conversation'
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

/** Conversation text in node order: each line block (with its id), then each choice option's text. */
export function conversationParts(c: Conversation): IndexPart[] {
  return c.nodes.flatMap((n): IndexPart[] => {
    if (n.type === 'lines')
      return blockTexts(n.content)
        .filter((b) => b.text.trim() !== '')
        .map((b) => ({ text: b.text, blockId: b.blockId, nodeId: n.id }))
    return n.type === 'choice'
      ? n.options.filter((o) => o.text.trim() !== '').map((o) => ({ text: o.text, nodeId: n.id }))
      : []
  })
}

/** File version of every scene and conversation, by id. */
export function bodyVersions(
  tree: ManuscriptNode[],
  versionOf: (path: string) => number,
): Map<string, number> {
  const out = new Map<string, number>()
  const walk = (nodes: ManuscriptNode[]) => {
    for (const n of nodes) {
      if ((n.type === 'scene' || n.type === 'conversation') && n.path)
        out.set(n.id, versionOf(n.path))
      walk(n.children)
    }
  }
  walk(tree)
  return out
}

/** Ids whose version moved since `seen`; ids not seen before do not count. */
export const changedBodies = (
  seen: ReadonlyMap<string, number>,
  now: ReadonlyMap<string, number>,
): string[] => [...now].filter(([id, v]) => seen.has(id) && seen.get(id) !== v).map(([id]) => id)

export interface ItemEntry {
  area: Area
  item: IndexInput
}

/** Chapters and scenes in tree order. Scene bodies come from `content` when given, else stay pending. */
export function manuscriptItems(
  tree: ManuscriptNode[],
  content?: ReadonlyMap<string, unknown>,
  conversations?: ReadonlyMap<string, Conversation>,
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
      } else if (n.type === 'conversation') {
        const c = conversations?.get(n.id)
        out.push({
          area: 'manuscript',
          item: {
            id: n.id,
            kind: 'conversation',
            title: n.title,
            parentId,
            ...(c ? { parts: conversationParts(c) } : {}),
          },
        })
      } else if (n.type === 'chapter') {
        out.push({
          area: 'manuscript',
          item: { id: n.id, kind: 'chapter', title: n.title, parentId },
        })
      }
      walk(n.children, n.id)
    }
  }
  walk(tree)
  return out
}

export const ruleItem = (
  r: Pick<Rule, 'id' | 'title' | 'description' | 'exceptions'>,
): ItemEntry => ({
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
  /** Same for conversations (game projects). */
  conversationContent?: ReadonlyMap<string, Conversation>
  rules: Pick<Rule, 'id' | 'title' | 'description' | 'exceptions'>[]
  timelines: TimelineLike[]
  entries: Pick<CodexEntry, 'id' | 'name' | 'aliases' | 'notes' | 'appendixText'>[]
  knowledge: Parameters<typeof knowledgeItem>[0][]
}

/** Builds the whole index from what is listed (trashed items are simply not passed). */
export function buildIndex(src: SearchSources): SearchIndex {
  const ix = createIndex()
  const all = [
    ...manuscriptItems(src.tree, src.sceneContent, src.conversationContent),
    ...src.rules.map(ruleItem),
    ...src.timelines.flatMap(timelineItems),
    ...src.entries.map(entryItem),
    ...src.knowledge.map(knowledgeItem),
  ]
  for (const { area, item } of all) ix.upsert(area, item)
  return ix
}

export interface LoadBodiesOptions {
  /** Items loaded between pauses. Default 20. */
  chunk?: number
  /** Called between chunks so the UI stays responsive. Default: a macrotask. */
  pause?: () => Promise<void>
  isCancelled?: () => boolean
}

const macrotask = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * Background pass: loads the body (scene or conversation) of every item that has none yet. A body that was set
 * meanwhile (an edit) is not overwritten. Returns how many items were filled.
 */
export async function loadBodies(
  index: SearchIndex,
  load: (id: string) => Promise<IndexPart[] | null>,
  opts: LoadBodiesOptions = {},
): Promise<number> {
  const chunk = opts.chunk ?? 20
  const pause = opts.pause ?? macrotask
  let filled = 0
  let n = 0
  for (const id of index.pendingBodies()) {
    if (opts.isCancelled?.()) break
    const parts = await load(id)
    if (parts !== null && index.get(id)?.parts === null) {
      index.setParts(id, parts)
      filled++
    }
    if (++n % chunk === 0) await pause()
  }
  return filled
}
