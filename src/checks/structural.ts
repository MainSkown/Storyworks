import { coverage } from '../project/coverage'
import { buildProblems, type LinkProblem } from '../project/linkProblems'
import { CODEX_KIND, KNOWLEDGE_KIND, type Link } from '../project/links'
import { makeFinding, type Finding, type FindingLocation } from './types'

// Node locations follow the link shape: `id` = timeline id, `blockId` = node id.

const BROKEN_MESSAGE: Record<LinkProblem['reason'], string> = {
  'passage-missing': 'A linked passage no longer exists.',
  'node-missing': 'A link points to a timeline event that is missing or deleted.',
  'entry-missing': 'A link points to a codex entry that is missing or deleted.',
  'knowledge-missing': 'A knowledge link points to an item or entry that is missing or deleted.',
}

export interface BrokenRef {
  ownerKind: 'node' | 'rule' | 'entry' | 'item'
  /** Timeline id for a node, item id for an item (conversation), else the rule or entry id. */
  ownerId: string
  /** Node id when the owner is a timeline node or a conversation (item) node. */
  ownerBlockId?: string
  /** Conversation option holding the reference (items only). */
  ownerOptionId?: string
  /** Message variant; 'ref' when absent. */
  variant?: 'ref' | 'node-target'
  ownerLabel: string
  /** The missing rule or entry id. */
  targetId: string
}

export interface BrokenLinksInput {
  links: readonly Link[]
  check: { targetMissing: (l: Link) => boolean; passageMissing: (l: Link) => boolean }
  /** Snippet of the linking passage. */
  passageLabel: (l: Link) => string
  /** Label of the target, or null when unknown (then no target location is given). */
  targetLabel: (l: Link) => string | null
  /** Broken references held by nodes, rules or entries (already found by the caller). */
  refs?: readonly BrokenRef[]
}

function targetLocation(l: Link, label: string): FindingLocation | null {
  if (l.kind === KNOWLEDGE_KIND) return null
  if (l.kind === CODEX_KIND) return { kind: 'entry', id: l.to.item, label }
  return { kind: 'node', id: l.to.block ?? '', timelineId: l.to.item, label }
}

export function brokenLinks(input: BrokenLinksInput): Finding[] {
  const out: Finding[] = []
  for (const p of buildProblems(input.links, input.check)) {
    const { link } = p
    const locations: FindingLocation[] = [
      {
        kind: 'scene',
        id: link.from.item,
        blockId: link.from.block,
        label: input.passageLabel(link),
      },
    ]
    const label = input.targetLabel(link)
    const target = label === null ? null : targetLocation(link, label)
    if (target) locations.push(target)
    out.push(
      makeFinding('broken-link', [link.id], BROKEN_MESSAGE[p.reason], locations, false, {
        variant: p.reason,
      }),
    )
  }
  for (const r of input.refs ?? []) {
    const ids = [
      r.ownerId,
      ...(r.ownerBlockId === undefined ? [] : [r.ownerBlockId]),
      ...(r.ownerOptionId === undefined ? [] : [r.ownerOptionId]),
      r.targetId,
    ]
    const here: FindingLocation =
      r.ownerKind === 'node'
        ? { kind: 'node', id: r.ownerBlockId ?? '', timelineId: r.ownerId, label: r.ownerLabel }
        : r.ownerKind === 'item'
          ? {
              kind: 'item',
              id: r.ownerId,
              ...(r.ownerBlockId === undefined ? {} : { nodeId: r.ownerBlockId }),
              label: r.ownerLabel,
            }
          : { kind: r.ownerKind, id: r.ownerId, blockId: r.ownerBlockId, label: r.ownerLabel }
    out.push(
      makeFinding(
        'broken-link',
        ids,
        r.variant === 'node-target'
          ? `"${r.ownerLabel}" points to a node that no longer exists.`
          : `"${r.ownerLabel}" links to an item that is missing or deleted.`,
        [here],
        false,
        { variant: r.variant ?? 'ref', params: { owner: r.ownerLabel } },
      ),
    )
  }
  return out
}

/** Shape of the store's `missing` and `invalid` item issues, plus an optional display title. */
export type FileProblem =
  | { kind: 'missing'; itemId: string; path: string; title?: string }
  | { kind: 'invalid'; itemId: string; path: string; title?: string; error?: { message: string } }
  | { kind: 'unlisted'; path: string }

export function invalidFiles(problems: readonly FileProblem[]): Finding[] {
  const out: Finding[] = []
  for (const p of problems) {
    if (p.kind === 'unlisted') continue
    const message =
      p.kind === 'missing'
        ? `File ${p.path} is listed in the book but missing.`
        : `File ${p.path} is not valid${p.error ? `: ${p.error.message}` : '.'}`
    const extra: { variant: string; params: Record<string, string> } =
      p.kind === 'missing'
        ? { variant: 'missing', params: { path: p.path } }
        : p.error
          ? { variant: 'invalid-detail', params: { path: p.path, error: p.error.message } }
          : { variant: 'invalid', params: { path: p.path } }
    out.push(
      makeFinding(
        'invalid-file',
        [p.itemId],
        message,
        [{ kind: 'file', id: p.itemId, label: p.title ?? p.path }],
        false,
        extra,
      ),
    )
  }
  return out
}

export interface NamedEntry {
  id: string
  typeId: string
  name: string
  aliases: readonly string[]
}

const nameKey = (s: string) => s.trim().toLowerCase()

export function duplicateNames(entries: readonly NamedEntry[]): Finding[] {
  const byType = new Map<string, NamedEntry[]>()
  for (const e of entries) byType.set(e.typeId, [...(byType.get(e.typeId) ?? []), e])
  const out: Finding[] = []
  for (const group of byType.values()) {
    const byKey = new Map<string, NamedEntry[]>()
    for (const e of group) {
      for (const k of new Set([e.name, ...e.aliases].map(nameKey))) {
        if (k !== '') byKey.set(k, [...(byKey.get(k) ?? []), e])
      }
    }
    const seen = new Set<string>()
    for (const [key, list] of byKey) {
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!
          const b = list[j]!
          const f = makeFinding(
            'duplicate-name',
            [a.id, b.id],
            `"${a.name}" and "${b.name}" share the name or alias "${key}".`,
            [
              { kind: 'entry', id: a.id, label: a.name },
              { kind: 'entry', id: b.id, label: b.name },
            ],
            true,
            { params: { a: a.name, b: b.name, name: key } },
          )
          if (seen.has(f.id)) continue
          seen.add(f.id)
          out.push(f)
        }
    }
  }
  return out
}

export interface TimelineGraph {
  id: string
  name: string
  nodes: readonly { id: string; title: string }[]
  edges: readonly { from: string; to: string }[]
}

export function isolatedNodes(timelines: readonly TimelineGraph[]): Finding[] {
  const out: Finding[] = []
  for (const t of timelines) {
    if (t.nodes.length < 2) continue
    const touched = new Set(t.edges.flatMap((e) => [e.from, e.to]))
    for (const n of t.nodes) {
      if (touched.has(n.id)) continue
      out.push(
        makeFinding(
          'isolated-node',
          [t.id, n.id],
          `"${n.title}" has no connections in timeline "${t.name}".`,
          [{ kind: 'node', id: n.id, timelineId: t.id, label: n.title }],
          false,
          { params: { title: n.title, timeline: t.name } },
        ),
      )
    }
  }
  return out
}

export interface UnlinkedRulesInput {
  rules: readonly { id: string; title: string }[]
  nodes: readonly { ruleIds: readonly string[] }[]
  entries: readonly { ruleIds: readonly string[] }[]
  /** Rule ids linked from elsewhere (e.g. manuscript blocks, if the book has such links). */
  otherLinkedIds?: Iterable<string>
}

export function unlinkedRules(input: UnlinkedRulesInput): Finding[] {
  const used = new Set<string>(input.otherLinkedIds ?? [])
  for (const o of [...input.nodes, ...input.entries]) for (const id of o.ruleIds) used.add(id)
  return input.rules
    .filter((r) => !used.has(r.id))
    .map((r) =>
      makeFinding(
        'unlinked-rule',
        [r.id],
        `Rule "${r.title}" is not linked to anything.`,
        [{ kind: 'rule', id: r.id, label: r.title }],
        false,
        { params: { title: r.title } },
      ),
    )
}

export interface EntryConnectionsInput {
  entries: readonly { id: string; name: string; ruleIds: readonly string[] }[]
  relationships: readonly { fromId: string; toId: string }[]
  groups: readonly { memberIds: readonly string[] }[]
  /** All scene links; codex and knowledge use links count. */
  links: readonly Link[]
  nodes: readonly { codexIds: readonly string[] }[]
  /** Entry ids connected some other way (POV, state values, learning events). */
  otherLinkedIds?: Iterable<string>
}

export function entriesWithoutConnections(input: EntryConnectionsInput): Finding[] {
  const used = new Set<string>(input.otherLinkedIds ?? [])
  for (const r of input.relationships) {
    used.add(r.fromId)
    used.add(r.toId)
  }
  for (const g of input.groups) for (const id of g.memberIds) used.add(id)
  for (const n of input.nodes) for (const id of n.codexIds) used.add(id)
  for (const l of input.links) {
    if (l.kind === CODEX_KIND) used.add(l.to.item)
    else if (l.kind === KNOWLEDGE_KIND && l.to.entry !== undefined) used.add(l.to.entry)
  }
  return input.entries
    .filter((e) => e.ruleIds.length === 0 && !used.has(e.id))
    .map((e) =>
      makeFinding(
        'entry-no-connections',
        [e.id],
        `"${e.name}" has no relationships, groups or links.`,
        [{ kind: 'entry', id: e.id, label: e.name }],
        false,
        { params: { name: e.name } },
      ),
    )
}

export interface CoverageFindingsInput {
  nodes: readonly { timelineId: string; id: string; title: string }[]
  scenes: readonly { id: string; title: string; wordCount: number }[]
  links: readonly Link[]
  isBroken: (link: Link) => boolean
}

export function coverageFindings(input: CoverageFindingsInput): Finding[] {
  const c = coverage({
    nodeIds: input.nodes.map((n) => n.id),
    scenes: input.scenes,
    links: input.links,
    isBroken: input.isBroken,
  })
  const noPassage = new Set(c.nodesWithoutPassages)
  const noLinks = new Set(c.scenesWithoutLinks)
  return [
    ...input.nodes
      .filter((n) => noPassage.has(n.id))
      .map((n) =>
        makeFinding(
          'node-no-passage',
          [n.timelineId, n.id],
          `Event "${n.title}" has no linked passage in the manuscript.`,
          [{ kind: 'node', id: n.id, timelineId: n.timelineId, label: n.title }],
          false,
          { params: { title: n.title } },
        ),
      ),
    ...input.scenes
      .filter((s) => noLinks.has(s.id))
      .map((s) =>
        makeFinding(
          'scene-no-links',
          [s.id],
          `Scene "${s.title}" has no passage linked to a timeline event.`,
          [{ kind: 'scene', id: s.id, label: s.title }],
          false,
          { params: { title: s.title } },
        ),
      ),
  ]
}

/** The id holds the open to-do ids, so a new open to-do brings a dismissed finding back. */
export function openTodos(
  scenes: readonly { id: string; title: string; todos: readonly { id: string; done: boolean }[] }[],
): Finding[] {
  const out: Finding[] = []
  for (const s of scenes) {
    const open = s.todos.filter((t) => !t.done)
    if (open.length === 0) continue
    out.push(
      makeFinding(
        'open-todo',
        [s.id, ...open.map((t) => t.id)],
        `Scene "${s.title}" has ${open.length} open revision to-do${open.length === 1 ? '' : 's'}.`,
        [{ kind: 'scene', id: s.id, label: s.title }],
        true,
        { params: { title: s.title, count: String(open.length) } },
      ),
    )
  }
  return out
}
