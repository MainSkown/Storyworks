import { toGraph } from '../game/conversationGraph'
import { linksOf } from '../game/crossLinks'
import { extractLines } from '../game/playthrough'
import { routeLabel, sameRoute, type RouteInfo } from '../game/routes'
import { brokenUses } from '../game/variableUses'
import type { Conversation, ConversationNode } from '../project/schemas/conversation'
import type { RouteRef } from '../project/schemas/route'
import type { StoryMap } from '../project/schemas/storyMap'
import type { Variable } from '../project/schemas/variables'
import { makeFinding, type Finding, type FindingLocation } from './types'

export interface GameCheckItem {
  id: string
  title: string
  type: 'scene' | 'conversation'
  trashed: boolean
  routes?: readonly RouteRef[]
}

export interface GraphCheckInput {
  /** Every script and conversation, trashed ones included (they are skipped). */
  items: readonly GameCheckItem[]
  /** Loaded conversations by item id; an item missing here is not judged. */
  conversations: ReadonlyMap<string, Conversation>
  variables: readonly Variable[]
  map: StoryMap
  /** Every timeline branch that still exists. */
  routes: readonly RouteInfo[]
}

export interface SpeakerCheckInput {
  items: readonly GameCheckItem[]
  /** Speaker ids used by the lines of each item (scripts and conversations). */
  speakerIds: ReadonlyMap<string, readonly string[]>
  /** Live (not deleted) codex entries. */
  codexIds: ReadonlySet<string>
}

const itemLocation = (item: GameCheckItem, nodeId?: string): FindingLocation => ({
  kind: 'item',
  id: item.id,
  ...(nodeId === undefined ? {} : { nodeId }),
  label: item.title,
})

function* liveConversations(input: Pick<GraphCheckInput, 'items' | 'conversations'>) {
  for (const item of input.items) {
    if (item.trashed || item.type !== 'conversation') continue
    const conv = input.conversations.get(item.id)
    if (conv) yield { item, conv }
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Lines 2: Hello there", "Choice 3": position plus a snippet for lines. */
function nodeLabel(c: Conversation, n: ConversationNode): string {
  const base = `${cap(n.type)} ${c.nodes.indexOf(n) + 1}`
  if (n.type !== 'lines') return base
  const text = extractLines(n.content).find((l) => l.text.trim())?.text.trim()
  return text ? `${base}: ${text.length > 40 ? `${text.slice(0, 40)}…` : text}` : base
}

const hasWay = (n: ConversationNode): boolean => {
  if (n.type === 'lines') return !!n.next
  if (n.type === 'jump') return !!n.target || !!n.link
  if (n.type === 'choice') return n.options.some((o) => !!o.target || !!o.link)
  return true
}

const nodeFinding = (
  checkId: 'dead-end' | 'unreachable-node',
  message: string,
  item: GameCheckItem,
  c: Conversation,
  n: ConversationNode,
) =>
  makeFinding(checkId, [item.id, n.id], message, [itemLocation(item, n.id)], false, {
    params: { node: nodeLabel(c, n), item: item.title },
  })

/** Non-End nodes with no way on. A dangling target still counts as a way (broken-link reports it). */
export function deadEnds(input: GraphCheckInput): Finding[] {
  const out: Finding[] = []
  for (const { item, conv } of liveConversations(input))
    for (const n of conv.nodes)
      if (n.type !== 'end' && !hasWay(n))
        out.push(nodeFinding('dead-end', `"${nodeLabel(conv, n)}" in "${item.title}" leads nowhere.`, item, conv, n))
  return out
}

/** Nodes other conversations link into by node id are entry points too. */
function linkedInNodes(input: GraphCheckInput): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const { conv } of liveConversations(input))
    for (const { link } of linksOf(conv)) {
      if (link.nodeId === undefined) continue
      const set = out.get(link.itemId) ?? new Set<string>()
      set.add(link.nodeId)
      out.set(link.itemId, set)
    }
  return out
}

/** Nodes not reachable from the start node (loops are fine). Without a usable start nothing is judged. */
export function unreachableNodes(input: GraphCheckInput): Finding[] {
  const out: Finding[] = []
  const entries = linkedInNodes(input)
  for (const { item, conv } of liveConversations(input)) {
    if (!conv.startNodeId || !conv.nodes.some((n) => n.id === conv.startNodeId)) continue
    const next = new Map<string, string[]>()
    for (const e of toGraph(conv).edges) next.set(e.from, [...(next.get(e.from) ?? []), e.to])
    const seen = new Set<string>()
    const stack = [conv.startNodeId, ...(entries.get(item.id) ?? [])]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      stack.push(...(next.get(id) ?? []))
    }
    for (const n of conv.nodes)
      if (!seen.has(n.id))
        out.push(
          nodeFinding('unreachable-node', `"${nodeLabel(conv, n)}" in "${item.title}" cannot be reached.`, item, conv, n),
        )
  }
  return out
}

/** Options with neither a node target nor a link. */
export function choiceNoTarget(input: GraphCheckInput): Finding[] {
  const out: Finding[] = []
  for (const { item, conv } of liveConversations(input))
    for (const n of conv.nodes) {
      if (n.type !== 'choice') continue
      for (const o of n.options)
        if (!o.target && !o.link)
          out.push(
            makeFinding(
              'choice-no-target',
              [item.id, n.id, o.id],
              `An option in "${item.title}" has no target.`,
              [itemLocation(item, n.id)],
              false,
              { params: { node: nodeLabel(conv, n), item: item.title } },
            ),
          )
    }
  return out
}

/** Conditions and sets that name a variable no longer in the list (one finding per place and variable). */
export function undefinedVariables(input: GraphCheckInput): Finding[] {
  const out: Finding[] = []
  for (const { item, conv } of liveConversations(input)) {
    const seen = new Set<string>()
    for (const u of brokenUses(conv, input.variables)) {
      if (u.problem !== 'undefined-variable') continue
      const at = [item.id, u.nodeId, ...(u.optionId === undefined ? [] : [u.optionId]), u.variableId]
      const key = at.join(':')
      if (seen.has(key)) continue
      seen.add(key)
      out.push(
        makeFinding(
          'undefined-variable',
          at,
          `"${item.title}" uses a variable that was deleted.`,
          [itemLocation(item, u.nodeId)],
          false,
          { params: { item: item.title, variable: u.variableId } },
        ),
      )
    }
  }
  return out
}

/**
 * Items reachable from the story-map Start boxes (no Start marked: the first box) over manual
 * arrows and conversation cross-links; conditions ignored. `allowed` limits which items may be entered.
 */
function reachableItems(input: GraphCheckInput, allowed: (item: GameCheckItem) => boolean): Set<string> | null {
  const { boxes, arrows } = input.map
  if (!boxes.length) return null
  const byId = new Map(input.items.map((i) => [i.id, i]))
  const key = (boxId: string): string | null => {
    const b = boxes.find((x) => x.id === boxId)
    return !b ? null : b.kind === 'item' ? `i:${b.itemId}` : `b:${b.id}`
  }
  const next = new Map<string, string[]>()
  const add = (from: string, to: string) => next.set(from, [...(next.get(from) ?? []), to])
  for (const a of arrows) {
    const f = key(a.from)
    const t = key(a.to)
    if (f && t) add(f, t)
  }
  for (const { item, conv } of liveConversations(input))
    for (const { link } of linksOf(conv)) add(`i:${item.id}`, `i:${link.itemId}`)

  const starts = boxes.filter((b) => b.start)
  const roots = (starts.length ? starts : [boxes[0]!]).map((b) => key(b.id)!)
  const seen = new Set<string>()
  const stack = [...roots]
  while (stack.length) {
    const k = stack.pop()!
    if (seen.has(k)) continue
    if (k.startsWith('i:')) {
      const item = byId.get(k.slice(2))
      if (!item || item.trashed || !allowed(item)) continue
    }
    seen.add(k)
    stack.push(...(next.get(k) ?? []))
  }
  return new Set([...seen].filter((k) => k.startsWith('i:')).map((k) => k.slice(2)))
}

/** Live items no Start box reaches. Broken link targets are left to broken-link. No boxes: nothing judged. */
export function unreachableItems(input: GraphCheckInput): Finding[] {
  const reached = reachableItems(input, () => true)
  if (!reached) return []
  return input.items
    .filter((i) => !i.trashed && !reached.has(i.id))
    .map((i) =>
      makeFinding('unreachable-item', [i.id], `"${i.title}" cannot be reached from a Start box.`, [itemLocation(i)], false, {
        params: { item: i.title },
      }),
    )
}

/**
 * An item tagged with route R needs a path from a Start box through items that are untagged or tagged R.
 * Tags whose branch is gone count as no tag. Items unreachable on the plain map are left to unreachable-item.
 */
export function routeUnreachable(input: GraphCheckInput): Finding[] {
  const plain = reachableItems(input, () => true)
  if (!plain) return []
  const live = (i: GameCheckItem) => (i.routes ?? []).filter((r) => input.routes.some((x) => sameRoute(x.ref, r)))
  const out: Finding[] = []
  const reachedBy = new Map<RouteInfo, Set<string>>()
  for (const item of input.items) {
    if (item.trashed || !plain.has(item.id)) continue
    const failed: string[] = []
    for (const ref of live(item)) {
      const route = input.routes.find((r) => sameRoute(r.ref, ref))!
      if (!reachedBy.has(route)) {
        const reached = reachableItems(input, (i) => {
          const tags = live(i)
          return !tags.length || tags.some((t) => sameRoute(t, ref))
        })
        reachedBy.set(route, reached ?? new Set())
      }
      if (!reachedBy.get(route)!.has(item.id)) failed.push(routeLabel(route, input.routes))
    }
    if (failed.length)
      out.push(
        makeFinding(
          'route-unreachable',
          [item.id],
          `"${item.title}" is tagged ${failed.join(', ')} but no path from a Start box stays on that route.`,
          [itemLocation(item)],
          false,
          { params: { route: failed.join(', ') } },
        ),
      )
  }
  return out
}

/** Speaker ids used by the lines of a conversation. */
export const speakerIdsOf = (c: Conversation): string[] => [
  ...new Set(
    c.nodes.flatMap((n) =>
      n.type === 'lines' ? extractLines(n.content).flatMap((l) => (l.speakerId ? [l.speakerId] : [])) : [],
    ),
  ),
]

/** Speaker links to a codex entry that no longer exists; one finding per item and speaker. */
export function brokenSpeakers(input: SpeakerCheckInput): Finding[] {
  const out: Finding[] = []
  for (const item of input.items) {
    if (item.trashed) continue
    for (const speaker of new Set(input.speakerIds.get(item.id) ?? []))
      if (!input.codexIds.has(speaker))
        out.push(
          makeFinding(
            'broken-speaker',
            [item.id, speaker],
            `A speaker in "${item.title}" is a codex entry that was deleted.`,
            [itemLocation(item)],
            false,
            { params: { item: item.title } },
          ),
        )
  }
  return out
}
