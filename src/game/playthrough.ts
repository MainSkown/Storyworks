import type { Condition } from '../project/schemas/condition'
import type { Conversation, ConversationNode, ItemLink } from '../project/schemas/conversation'
import type { Variable } from '../project/schemas/variables'
import { applySets, evaluateCondition, initialValues, type Values } from './conditions'

/** Node entries allowed in one play-through; guards endless jump loops. */
export const MAX_STEPS = 1000

export interface ShownLine {
  lineId: string
  speakerId?: string
  speakerName?: string
  kind: 'speech' | 'text'
  text: string
}
export interface LogEntry {
  nodeId: string
  lines: ShownLine[]
}

export type StopReason =
  | { kind: 'no-start' }
  | { kind: 'empty-conversation' }
  | { kind: 'node-blocked'; nodeId: string; failedCondition: Condition }
  | { kind: 'undefined-variable'; variableId: string; nodeId: string }
  | { kind: 'type-mismatch'; variableId: string; nodeId: string }
  | { kind: 'missing-target'; nodeId: string; optionId?: string }
  | { kind: 'no-visible-options'; nodeId: string }
  | { kind: 'step-limit' }

export interface VisibleOption {
  id: string
  text: string
}

export interface PlayState {
  readonly conv: Conversation
  readonly variables: readonly Variable[]
  readonly values: Values
  /** Node the player is at (or stopped at); null before any node was entered. */
  readonly current: string | null
  readonly log: readonly LogEntry[]
  readonly visits: Readonly<Record<string, number>>
  readonly steps: number
  /** The node just entered had been visited before. */
  readonly loop: boolean
  readonly status: 'playing' | 'ended' | 'stopped' | 'left'
  /** Set when the run left this conversation through a cross-item link. */
  readonly leave: ItemLink | null
  readonly stop: StopReason | null
  /** Options shown at the current choice node. */
  readonly options: readonly VisibleOption[]
}

export type PlayView =
  | { kind: 'lines'; nodeId: string; lines: ShownLine[]; canContinue: boolean; loop: boolean }
  | { kind: 'choice'; nodeId: string; options: VisibleOption[]; loop: boolean }
  | { kind: 'end' }
  | { kind: 'left'; link: ItemLink }
  | { kind: 'stopped'; reason: StopReason }

type Json = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Json[] }

const inlineText = (n: Json): string =>
  n.type === 'text'
    ? (n.text ?? '')
    : n.type === 'hardBreak'
      ? '\n'
      : (n.content ?? []).map(inlineText).join('')

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)

export function extractLines(content: Record<string, unknown>): ShownLine[] {
  const blocks = (Array.isArray(content.content) ? content.content : []) as Json[]
  return blocks
    .filter((b) => b.type === 'line')
    .map((b) => {
      const a = b.attrs ?? {}
      const speakerId = str(a.speakerId)
      const speakerName = str(a.speakerName)
      return {
        lineId: String(a.lineId),
        ...(speakerId && { speakerId }),
        ...(speakerName && { speakerName }),
        kind: a.kind === 'text' ? 'text' : 'speech',
        text: inlineText(b),
      }
    })
}

const stopped = (s: PlayState, reason: StopReason, patch: Partial<PlayState> = {}): PlayState => ({
  ...s,
  ...patch,
  status: 'stopped',
  stop: reason,
})

/** Enters `nodeId`, following jumps, until the player has something to show or the run ends. */
function enter(from: PlayState, nodeId: string, optionId?: string): PlayState {
  let s = from
  let id: string | null = nodeId
  let viaOption = optionId
  for (;;) {
    const node: ConversationNode | undefined = s.conv.nodes.find((n) => n.id === id)
    if (!id || !node) {
      return stopped(s, {
        kind: 'missing-target',
        nodeId: s.current ?? '',
        ...(viaOption && { optionId: viaOption }),
      })
    }
    if (s.steps >= MAX_STEPS) return stopped(s, { kind: 'step-limit' })
    const seen = s.visits[node.id] ?? 0
    s = {
      ...s,
      current: node.id,
      steps: s.steps + 1,
      visits: { ...s.visits, [node.id]: seen + 1 },
      loop: seen > 0,
      options: [],
    }
    const problemStop = (p: { kind: 'undefined-variable' | 'type-mismatch'; variableId: string }) =>
      stopped(s, { kind: p.kind, variableId: p.variableId, nodeId: node.id })

    const entry = evaluateCondition(node.condition, s.variables, s.values)
    if (!entry.ok) return problemStop(entry.reason)
    if (!entry.value && node.condition)
      return stopped(s, { kind: 'node-blocked', nodeId: node.id, failedCondition: node.condition })
    const applied = applySets(node.sets, s.variables, s.values)
    if (!applied.ok) return problemStop(applied.reason)
    s = { ...s, values: applied.values }

    if (node.type === 'end') return { ...s, status: 'ended' }
    if (node.type === 'lines')
      return {
        ...s,
        status: 'playing',
        log: [...s.log, { nodeId: node.id, lines: extractLines(node.content) }],
      }
    if (node.type === 'choice') {
      const options: VisibleOption[] = []
      for (const o of node.options) {
        const r = evaluateCondition(o.condition, s.variables, s.values)
        if (!r.ok) return problemStop(r.reason)
        if (r.value) options.push({ id: o.id, text: o.text })
      }
      if (!options.length) return stopped(s, { kind: 'no-visible-options', nodeId: node.id })
      return { ...s, status: 'playing', options }
    }
    // jump: no screen, continue to its target
    if (node.link) return { ...s, status: 'left', leave: node.link }
    id = node.target?.nodeId ?? null
    viaOption = undefined
  }
}

export interface StartOpts {
  /** Where to begin; the conversation's start node when omitted. */
  nodeId?: string
  /** Carried-over variable values (a run that came from another item). */
  values?: Values
  steps?: number
  visits?: Readonly<Record<string, number>>
}

/** Starts a run, optionally mid-way through a longer play-through (see `storyPlaythrough`). */
export function startAt(
  conv: Conversation,
  variables: readonly Variable[],
  o: StartOpts = {},
): PlayState {
  const base: PlayState = {
    conv,
    variables,
    values: o.values ?? initialValues(variables),
    current: null,
    log: [],
    visits: o.visits ?? {},
    steps: o.steps ?? 0,
    loop: false,
    status: 'playing',
    leave: null,
    stop: null,
    options: [],
  }
  if (!conv.nodes.length) return stopped(base, { kind: 'empty-conversation' })
  const first = o.nodeId ?? conv.startNodeId
  if (o.nodeId === undefined && (!first || !conv.nodes.some((n) => n.id === first)))
    return stopped(base, { kind: 'no-start' })
  return enter(base, first ?? '')
}

export const start = (conv: Conversation, variables: readonly Variable[]): PlayState =>
  startAt(conv, variables)

export const reset = (s: PlayState): PlayState => start(s.conv, s.variables)

const nodeNow = (s: PlayState) => s.conv.nodes.find((n) => n.id === s.current)

/** Moves a lines node on to its `next`. */
export function advance(s: PlayState): PlayState {
  const node = nodeNow(s)
  if (s.status !== 'playing' || node?.type !== 'lines') return s
  return enter(s, node.next ?? '')
}

/** Picks a visible option of the current choice node. */
export function choose(s: PlayState, optionId: string): PlayState {
  const node = nodeNow(s)
  if (s.status !== 'playing' || node?.type !== 'choice') return s
  if (!s.options.some((o) => o.id === optionId)) return s
  const opt = node.options.find((o) => o.id === optionId)
  if (!opt) return s
  const applied = applySets(opt.sets, s.variables, s.values)
  if (!applied.ok)
    return stopped(s, {
      kind: applied.reason.kind,
      variableId: applied.reason.variableId,
      nodeId: node.id,
    })
  if (opt.link) return { ...s, values: applied.values, status: 'left', leave: opt.link, options: [] }
  return enter({ ...s, values: applied.values }, opt.target ?? '', optionId)
}

export function view(s: PlayState): PlayView {
  if (s.status === 'stopped' && s.stop) return { kind: 'stopped', reason: s.stop }
  if (s.status === 'ended') return { kind: 'end' }
  if (s.status === 'left' && s.leave) return { kind: 'left', link: s.leave }
  const node = nodeNow(s)
  if (node?.type === 'lines')
    return {
      kind: 'lines',
      nodeId: node.id,
      lines: s.log[s.log.length - 1]?.lines ?? [],
      canContinue: true,
      loop: s.loop,
    }
  return { kind: 'choice', nodeId: s.current ?? '', options: [...s.options], loop: s.loop }
}
