import { toGraph } from '../game/conversationGraph'
import { extractLines, type ShownLine } from '../game/playthrough'
import { listRoutes } from '../game/routes'
import type { LinkNames } from '../gamedoc/linkLabels'
import type { Conversation, ConversationNode } from '../project/schemas/conversation'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { Glossary } from '../project/schemas/glossary'
import type { Mechanic } from '../project/schemas/mechanic'
import type { MechanicCategory } from '../project/schemas/mechanicCategory'
import type { RouteRef } from '../project/schemas/route'
import type { StoryMap } from '../project/schemas/storyMap'
import type { Variable } from '../project/schemas/variables'
import { derivedArrows } from '../storymap/ops'
import { ExportError } from './build'
import { GAME_FORMAT, GAME_VERSION, type GameDoc, type GameItem, type GameLine, type GameNode } from './gameModel'

/** Everything game export reads from the open project, as plain data and loader functions. */
export interface GameSource {
  meta: GameDoc['project']
  variables: readonly Variable[]
  /** Live tree only: trashed items are not in it. */
  manuscript: readonly ManuscriptNode[]
  loadConversation(id: string): Promise<{ ok: true; value: Conversation } | { ok: false }>
  loadScriptLines(id: string): Promise<ShownLine[] | null>
  /** Codex entries, for speaker names. */
  entries: readonly { id: string; name: string }[]
  timelines: readonly { id: string; name: string; branches: readonly { id: string; name: string }[] }[]
  storyMap: StoryMap
  overview: Record<string, unknown> | null
  categories: readonly MechanicCategory[]
  mechanics: readonly Mechanic[]
  glossary: Glossary['entries']
  linkNames: LinkNames
}

type Json = { type?: string; text?: string; content?: Json[] }
const isInline = (n: Json) => n.type === 'text' || n.type === 'hardBreak'
const inlineText = (n: Json): string =>
  n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? '\n' : (n.content ?? []).map(inlineText).join('')

function blockLines(n: Json): string[] {
  const kids = n.content ?? []
  if (kids.length === 0) return n.type === 'paragraph' || n.type === 'heading' ? [''] : []
  if (kids.every(isInline)) return [kids.map(inlineText).join('')]
  return kids.flatMap(blockLines)
}

/** Rich text as plain text, one line per block; marks (comments included) are dropped. */
export const plainText = (doc: Record<string, unknown> | null): string =>
  doc ? blockLines(doc as Json).join('\n').trim() : ''

const speakerOf = (l: ShownLine, names: Map<string, string>): GameLine => ({
  lineId: l.lineId,
  kind: l.kind,
  speakerId: l.speakerId ?? null,
  speakerName: l.speakerId ? (names.get(l.speakerId) ?? null) : (l.speakerName ?? null),
  text: l.text,
})

const optional = <K extends string, V>(key: K, value: V | undefined) =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>)

function nodeOf(n: ConversationNode, names: Map<string, string>): GameNode {
  const base = { id: n.id, ...optional('condition', n.condition), sets: n.sets }
  switch (n.type) {
    case 'lines':
      return { ...base, type: 'lines', lines: extractLines(n.content).map((l) => speakerOf(l, names)), next: n.next }
    case 'choice':
      return {
        ...base,
        type: 'choice',
        options: n.options.map((o) => ({
          id: o.id,
          text: o.text,
          target: o.target,
          ...optional('link', o.link),
          ...optional('condition', o.condition),
          sets: o.sets,
        })),
      }
    case 'jump':
      return { ...base, type: 'jump', target: n.target?.nodeId ?? null, ...optional('link', n.link) }
    case 'end':
      return { ...base, type: 'end' }
  }
}

/** Reads the open game once into the format-neutral model. Throws ExportError for an unreadable item. */
export async function buildGameDoc(src: GameSource): Promise<GameDoc> {
  const names = new Map(src.entries.map((e) => [e.id, e.name]))
  const routes = listRoutes(src.timelines)
  const routeName = (r: RouteRef) =>
    routes.find((x) => x.ref.timelineId === r.timelineId && x.ref.branchId === r.branchId)?.name ?? null
  const base = (n: ManuscriptNode, parentId: string | null) => ({
    id: n.id,
    title: n.title,
    parentId,
    routes: (n.routes ?? []).map((r) => ({ ...r, name: routeName(r) })),
  })

  const items: GameItem[] = []
  const conversations: { id: string; conversation: Conversation }[] = []
  const walk = async (nodes: readonly ManuscriptNode[], parentId: string | null): Promise<void> => {
    for (const n of nodes) {
      if (n.type === 'scene') {
        const lines = await src.loadScriptLines(n.id)
        if (!lines) throw new ExportError('sceneUnreadable', n.title)
        items.push({ ...base(n, parentId), type: 'script', lines: lines.map((l) => speakerOf(l, names)) })
      } else if (n.type === 'conversation') {
        const r = await src.loadConversation(n.id)
        if (!r.ok) throw new ExportError('sceneUnreadable', n.title)
        conversations.push({ id: n.id, conversation: r.value })
        items.push({
          ...base(n, parentId),
          type: 'conversation',
          startNodeId: r.value.startNodeId,
          nodes: r.value.nodes.map((x) => nodeOf(x, names)),
          edges: toGraph(r.value).edges.map((e) => ({ id: e.id, from: e.from, to: e.to, ...optional('label', e.label) })),
        })
      } else {
        items.push({ ...base(n, parentId), type: 'folder' })
        await walk(n.children, n.id)
      }
    }
  }
  await walk(src.manuscript, null)

  // Boxes of trashed or deleted items would point at nothing, so they and their arrows are left out.
  const exported = new Set(items.map((i) => i.id))
  const boxes = src.storyMap.boxes.filter((b) => b.kind === 'beat' || exported.has(b.itemId))
  const boxIds = new Set(boxes.map((b) => b.id))
  const map = { ...src.storyMap, boxes, arrows: src.storyMap.arrows.filter((a) => boxIds.has(a.from) && boxIds.has(a.to)) }
  const manual = map.arrows.map((a) => ({
    id: a.id,
    from: a.from,
    to: a.to,
    derived: false,
    ...optional('condition', a.condition),
  }))
  const derived = derivedArrows(map, conversations).map((a) => ({
    id: a.id,
    from: a.from,
    to: a.to,
    derived: true,
    sources: a.sources.map((s) => ({ nodeId: s.nodeId, ...optional('optionId', s.optionId) })),
  }))

  return {
    format: GAME_FORMAT,
    version: GAME_VERSION,
    project: src.meta,
    variables: [...src.variables],
    items,
    storyMap: {
      boxes: boxes.map((b) => (b.kind === 'item' ? { id: b.id, kind: 'item', itemId: b.itemId } : { id: b.id, kind: 'beat', text: b.text })),
      arrows: [...manual, ...derived],
      starts: boxes.filter((b) => b.start).map((b) => b.id),
    },
    routes: routes.map((r) => ({ ...r.ref, name: r.name, timelineName: r.timelineName })),
    gameDocument: {
      overview: plainText(src.overview),
      categories: src.categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
      mechanics: src.mechanics.map((m) => ({
        id: m.id,
        title: m.title,
        summary: m.summary,
        categoryId: m.categoryId,
        status: m.status,
        tags: m.tags,
        description: plainText(m.description),
        parameters: m.parameters.map((p) => ({ id: p.id, name: p.name, value: p.value })),
        links: m.links.map((l) => ({ kind: l.kind, id: l.id, name: src.linkNames[l.kind].get(l.id) ?? null })),
      })),
      glossary: src.glossary.map((g) => ({ id: g.id, term: g.term, definition: g.definition })),
    },
  }
}
