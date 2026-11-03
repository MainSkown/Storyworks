import type { Calendar } from '../calendar'
import type { KindId } from '../project/kinds'
import type { Link } from '../project/links'
import type { OrderContext } from '../timeline/order'
import {
  brokenSpeakers,
  choiceNoTarget,
  deadEnds,
  routeUnreachable,
  undefinedVariables,
  unreachableItems,
  unreachableNodes,
  type GraphCheckInput,
  type SpeakerCheckInput,
} from './game'
import { mechanicBrokenLinks, mechanicsNoLinks, variablesUnused, type GameDocInput } from './gameDoc'
import { dateOrder, invalidNodeDates, type DateOrderTimeline } from './dates'
import {
  appearancesAfterFinal,
  knowledgeTiming,
  stateOverlaps,
  type CheckKind,
  type CheckState,
  type KnowledgeItemInput,
  type KnowledgeUse,
  type PassageUse,
} from './stateKnowledge'
import {
  brokenLinks,
  coverageFindings,
  duplicateNames,
  entriesWithoutConnections,
  invalidFiles,
  isolatedNodes,
  openTodos,
  unlinkedRules,
  type BrokenRef,
  type FileProblem,
} from './structural'
import { CHECK_IDS, CHECK_KINDS, type CheckId, type Finding, type Severity } from './types'

export interface CheckTimeline extends DateOrderTimeline {
  name: string
  nodes: (DateOrderTimeline['nodes'][number] & {
    ruleIds: readonly string[]
    codexIds: readonly string[]
  })[]
}

/** Game projects only; built by `gatherGameData`. */
export interface GameCheckData {
  graph: GraphCheckInput
  speakers: SpeakerCheckInput
  doc: GameDocInput
}

/** Plain inputs for every checker; the stores are adapted into this by `gatherCheckData`. */
export interface CheckData {
  calendar: Calendar
  order: OrderContext
  timelines: CheckTimeline[]
  /** Live scenes only; `todos` are the scene's revision to-dos. */
  scenes: { id: string; title: string; wordCount: number; todos: { id: string; done: boolean }[] }[]
  links: Link[]
  linkCheck: {
    targetMissing: (l: Link) => boolean
    passageMissing: (l: Link) => boolean
    /** Either end gone (broken links do not count for coverage). */
    isBroken: (l: Link) => boolean
  }
  passageLabel: (l: Link) => string
  targetLabel: (l: Link) => string | null
  /** Broken references held by nodes, rules or entries. */
  brokenRefs: BrokenRef[]
  rules: { id: string; title: string }[]
  entries: {
    id: string
    typeId: string
    name: string
    aliases: string[]
    ruleIds: string[]
  }[]
  relationships: { fromId: string; toId: string }[]
  groups: { memberIds: string[] }[]
  knowledgeItems: KnowledgeItemInput[]
  stateKinds: CheckKind[]
  states: CheckState[]
  /** Entry links with the block's timeline positions. */
  uses: PassageUse[]
  knowledgeUses: KnowledgeUse[]
  entryLabel: (entryId: string) => string
  valueLabel: (state: CheckState) => string
  /** Entries connected by POV, state values or learning events. */
  otherLinkedIds: string[]
  /** Rules connected some other way (a knowledge item is about them). */
  otherRuleLinkedIds: string[]
  /** Missing or invalid item files. */
  problems: FileProblem[]
  /** Game projects only. */
  game?: GameCheckData
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function sortFindings(list: Finding[]): Finding[] {
  const key = (f: Finding) => f.locations[0]?.label ?? ''
  return list
    .map((f, i) => ({ f, i }))
    .sort(
      (x, y) =>
        SEVERITY_RANK[x.f.severity] - SEVERITY_RANK[y.f.severity] ||
        cmp(key(x.f), key(y.f)) ||
        cmp(x.f.message, y.f.message) ||
        cmp(x.f.id, y.f.id) ||
        x.i - y.i,
    )
    .map((x) => x.f)
}

type Checker = (d: CheckData) => Finding[]

/** One checker per id, so a disabled check is never run. */
const CHECKERS: Record<CheckId, Checker> = {
  'broken-link': (d) =>
    brokenLinks({
      links: d.links,
      check: d.linkCheck,
      passageLabel: d.passageLabel,
      targetLabel: d.targetLabel,
      refs: d.brokenRefs,
    }),
  'invalid-file': (d) => invalidFiles(d.problems),
  'invalid-date': (d) =>
    invalidNodeDates(
      d.calendar,
      d.timelines.flatMap((t) =>
        t.nodes.map((n) => ({ id: n.id, title: n.title, timelineId: t.id, date: n.date })),
      ),
    ),
  'date-order': (d) => dateOrder(d.calendar, d.timelines),
  'duplicate-name': (d) => duplicateNames(d.entries),
  'state-overlap': (d) =>
    stateOverlaps(
      { states: d.states, kinds: d.stateKinds, entryLabel: d.entryLabel, valueLabel: d.valueLabel },
      d.order,
    ),
  'appearance-after-final': (d) =>
    appearancesAfterFinal(
      { states: d.states, uses: d.uses, entryLabel: d.entryLabel, valueLabel: d.valueLabel },
      d.order,
    ),
  'knowledge-timing': (d) =>
    knowledgeTiming(
      { items: d.knowledgeItems, uses: d.knowledgeUses, entryLabel: d.entryLabel },
      d.order,
    ),
  // One coverage call produces both kinds; each id keeps its own half.
  'node-no-passage': (d) => coverage(d).filter((f) => f.checkId === 'node-no-passage'),
  'scene-no-links': (d) => coverage(d).filter((f) => f.checkId === 'scene-no-links'),
  'isolated-node': (d) => isolatedNodes(d.timelines),
  'unlinked-rule': (d) =>
    unlinkedRules({
      rules: d.rules,
      nodes: d.timelines.flatMap((t) => t.nodes),
      entries: d.entries,
      otherLinkedIds: d.otherRuleLinkedIds,
    }),
  'entry-no-connections': (d) =>
    entriesWithoutConnections({
      entries: d.entries,
      relationships: d.relationships,
      groups: d.groups,
      links: d.links,
      nodes: d.timelines.flatMap((t) => t.nodes),
      otherLinkedIds: d.otherLinkedIds,
    }),
  'open-todo': (d) => openTodos(d.scenes),
  // Game checks; a missing slice (not a game project) finds nothing.
  'dead-end': (d) => (d.game ? deadEnds(d.game.graph) : []),
  'unreachable-node': (d) => (d.game ? unreachableNodes(d.game.graph) : []),
  'unreachable-item': (d) => (d.game ? unreachableItems(d.game.graph) : []),
  'choice-no-target': (d) => (d.game ? choiceNoTarget(d.game.graph) : []),
  'undefined-variable': (d) => (d.game ? undefinedVariables(d.game.graph) : []),
  'route-unreachable': (d) => (d.game ? routeUnreachable(d.game.graph) : []),
  'broken-speaker': (d) => (d.game ? brokenSpeakers(d.game.speakers) : []),
  'mechanic-broken-link': (d) => (d.game ? mechanicBrokenLinks(d.game.doc) : []),
  'mechanic-no-links': (d) => (d.game ? mechanicsNoLinks(d.game.doc) : []),
  'variable-unused': (d) => (d.game ? variablesUnused(d.game.doc) : []),
}

function coverage(d: CheckData): Finding[] {
  return coverageFindings({
    nodes: d.timelines.flatMap((t) =>
      t.nodes.map((n) => ({ timelineId: t.id, id: n.id, title: n.title })),
    ),
    scenes: d.scenes,
    links: d.links,
    isBroken: d.linkCheck.isBroken,
  })
}

/** Runs the enabled checks that apply to the project kind; findings are deduped by id and sorted by severity, then label and message. */
export function runChecks(
  data: CheckData,
  kind: KindId,
  enabled: (id: CheckId) => boolean,
): Finding[] {
  const seen = new Set<string>()
  const all: Finding[] = []
  for (const id of CHECK_IDS) {
    if (!CHECK_KINDS[id].includes(kind) || !enabled(id)) continue
    for (const f of CHECKERS[id](data)) {
      if (seen.has(f.id)) continue
      seen.add(f.id)
      all.push(f)
    }
  }
  return sortFindings(all)
}
