import type { Conversation } from '../project/schemas/conversation'
import type { StoryMap } from '../project/schemas/storyMap'
import type { Variable } from '../project/schemas/variables'
import { evaluateCondition, initialValues, type Values } from './conditions'
import type { LinkBroken } from './crossLinks'
import {
  advance,
  choose,
  MAX_STEPS,
  startAt,
  type PlayState,
  type ShownLine,
  type StopReason,
  type VisibleOption,
} from './playthrough'

/** What the runner needs to know about an item; the caller loads the files. */
export type StoryResolved =
  | { kind: 'conversation'; title: string; conversation: Conversation }
  | { kind: 'script'; title: string; lines: ShownLine[] }
  | { kind: 'trashed'; title: string }
  | { kind: 'missing' }

export interface StoryModel {
  map: StoryMap
  variables: readonly Variable[]
  resolve(itemId: string): StoryResolved
}

export type StoryStart = { boxId: string } | { itemId: string; nodeId?: string }

export type StoryStop =
  | Exclude<StopReason, { kind: 'undefined-variable' | 'type-mismatch' }>
  | { kind: 'undefined-variable' | 'type-mismatch'; variableId: string; nodeId?: string; boxId?: string }
  | { kind: 'broken-link'; reason: LinkBroken; itemId: string }
  | { kind: 'broken-box'; boxId: string }
  | { kind: 'no-arrow-passes'; boxId: string }

export type StoryLogEntry =
  | { type: 'item'; itemId?: string; boxId?: string; title: string }
  | { type: 'lines'; itemId: string; nodeId: string; lines: ShownLine[] }
  | { type: 'choice'; text: string }
  | { type: 'beat'; boxId: string; text: string }

export interface StoryArrowOption {
  id: string
  toBoxId: string
  toTitle: string
}

type Stage =
  | { kind: 'conversation'; itemId: string; title: string; play: PlayState; logged: number }
  | { kind: 'script'; itemId: string; title: string; lines: ShownLine[] }
  | { kind: 'beat'; boxId: string; text: string }
  | { kind: 'item-end'; arrows: StoryArrowOption[] }

export interface StoryState {
  readonly model: StoryModel
  readonly from: StoryStart
  readonly values: Values
  readonly steps: number
  /** Visit counts per conversation item, per node. */
  readonly visits: Readonly<Record<string, Readonly<Record<string, number>>>>
  readonly log: readonly StoryLogEntry[]
  readonly stage: Stage | null
  readonly status: 'playing' | 'ended' | 'stopped'
  readonly stop: StoryStop | null
}

export type StoryView =
  | { kind: 'lines'; itemId: string; title: string; nodeId: string; lines: ShownLine[]; canContinue: boolean; loop: boolean }
  | { kind: 'choice'; itemId: string; title: string; nodeId: string; options: VisibleOption[]; loop: boolean }
  | { kind: 'script'; itemId: string; title: string; lines: ShownLine[] }
  | { kind: 'beat'; boxId: string; text: string }
  | { kind: 'item-end'; arrows: StoryArrowOption[] }
  | { kind: 'end' }
  | { kind: 'stopped'; itemId?: string; reason: StoryStop }

const stopped = (s: StoryState, reason: StoryStop, patch: Partial<StoryState> = {}): StoryState => ({
  ...s,
  ...patch,
  status: 'stopped',
  stop: reason,
})
const ended = (s: StoryState): StoryState => ({ ...s, status: 'ended', stage: null })

const boxOfItem = (map: StoryMap, itemId: string) =>
  map.boxes.find((b) => b.kind === 'item' && b.itemId === itemId)

/** Moves the engine's progress (log, values, visits, outcome) into the story state. */
function absorb(
  s: StoryState,
  itemId: string,
  title: string,
  play: PlayState,
  logged: number,
): StoryState {
  const fresh = play.log.slice(logged).map(
    (e): StoryLogEntry => ({ type: 'lines', itemId, nodeId: e.nodeId, lines: e.lines }),
  )
  const next: StoryState = {
    ...s,
    values: play.values,
    steps: play.steps,
    visits: { ...s.visits, [itemId]: play.visits },
    log: [...s.log, ...fresh],
    stage: { kind: 'conversation', itemId, title, play, logged: play.log.length },
  }
  if (play.status === 'stopped' && play.stop) return stopped(next, play.stop)
  if (play.status === 'ended') return finishItem(next, boxOfItem(s.model.map, itemId)?.id)
  if (play.status === 'left' && play.leave) return enterItem(next, play.leave.itemId, play.leave.nodeId)
  return next
}

function enterItem(s: StoryState, itemId: string, nodeId?: string): StoryState {
  const r = s.model.resolve(itemId)
  if (r.kind === 'missing') return stopped(s, { kind: 'broken-link', reason: 'item-missing', itemId })
  if (r.kind === 'trashed') return stopped(s, { kind: 'broken-link', reason: 'item-trashed', itemId })
  const boxId = boxOfItem(s.model.map, itemId)?.id
  const header: StoryLogEntry = { type: 'item', itemId, ...(boxId && { boxId }), title: r.title }
  const withHeader = { ...s, log: [...s.log, header] }
  if (r.kind === 'script') {
    if (s.steps >= MAX_STEPS) return stopped(withHeader, { kind: 'step-limit' })
    return {
      ...withHeader,
      steps: s.steps + 1,
      log: [...withHeader.log, { type: 'lines', itemId, nodeId: '', lines: r.lines }],
      stage: { kind: 'script', itemId, title: r.title, lines: r.lines },
    }
  }
  if (nodeId !== undefined && !r.conversation.nodes.some((n) => n.id === nodeId))
    return stopped(withHeader, { kind: 'broken-link', reason: 'node-missing', itemId })
  const play = startAt(r.conversation, s.model.variables, {
    ...(nodeId !== undefined && { nodeId }),
    values: s.values,
    steps: s.steps,
    visits: s.visits[itemId] ?? {},
  })
  return absorb(withHeader, itemId, r.title, play, 0)
}

function enterBox(s: StoryState, boxId: string): StoryState {
  const box = s.model.map.boxes.find((b) => b.id === boxId)
  if (!box) return stopped(s, { kind: 'broken-box', boxId })
  if (box.kind === 'beat') {
    if (s.steps >= MAX_STEPS) return stopped(s, { kind: 'step-limit' })
    return {
      ...s,
      steps: s.steps + 1,
      log: [...s.log, { type: 'beat', boxId, text: box.text }],
      stage: { kind: 'beat', boxId, text: box.text },
    }
  }
  if (s.model.resolve(box.itemId).kind === 'missing' || s.model.resolve(box.itemId).kind === 'trashed')
    return stopped(s, { kind: 'broken-box', boxId })
  return enterItem(s, box.itemId)
}

function titleOfBox(s: StoryState, boxId: string): string {
  const box = s.model.map.boxes.find((b) => b.id === boxId)
  if (!box) return ''
  if (box.kind === 'beat') return box.text
  const r = s.model.resolve(box.itemId)
  return r.kind === 'missing' ? '' : r.title
}

/** The item (or beat) is done: offer the manual arrows whose condition holds, or end the story. */
function finishItem(s: StoryState, boxId: string | undefined): StoryState {
  const outgoing = boxId ? s.model.map.arrows.filter((a) => a.from === boxId) : []
  if (!boxId || outgoing.length === 0) return ended(s)
  const offered: StoryArrowOption[] = []
  for (const a of outgoing) {
    const r = evaluateCondition(a.condition, s.model.variables, s.values)
    if (!r.ok) return stopped(s, { kind: r.reason.kind, variableId: r.reason.variableId, boxId })
    if (r.value) offered.push({ id: a.id, toBoxId: a.to, toTitle: titleOfBox(s, a.to) })
  }
  if (!offered.length) return stopped(s, { kind: 'no-arrow-passes', boxId })
  return { ...s, stage: { kind: 'item-end', arrows: offered } }
}

export function startStory(model: StoryModel, from: StoryStart): StoryState {
  const base: StoryState = {
    model,
    from,
    values: initialValues(model.variables),
    steps: 0,
    visits: {},
    log: [],
    stage: null,
    status: 'playing',
    stop: null,
  }
  return 'boxId' in from ? enterBox(base, from.boxId) : enterItem(base, from.itemId, from.nodeId)
}

export const resetStory = (s: StoryState): StoryState => startStory(s.model, s.from)

/** Continue past lines, a script or a beat. */
export function advanceStory(s: StoryState): StoryState {
  const st = s.stage
  if (s.status !== 'playing' || !st) return s
  if (st.kind === 'conversation')
    return absorb(s, st.itemId, st.title, advance(st.play), st.logged)
  if (st.kind === 'script') return finishItem(s, boxOfItem(s.model.map, st.itemId)?.id)
  if (st.kind === 'beat') return finishItem(s, st.boxId)
  return s
}

export function chooseStory(s: StoryState, optionId: string): StoryState {
  const st = s.stage
  if (s.status !== 'playing' || st?.kind !== 'conversation') return s
  if (!st.play.options.some((o) => o.id === optionId)) return s
  const node = st.play.conv.nodes.find((n) => n.id === st.play.current)
  const text = node?.type === 'choice' ? (node.options.find((o) => o.id === optionId)?.text ?? '') : ''
  const next = choose(st.play, optionId)
  return absorb({ ...s, log: [...s.log, { type: 'choice', text }] }, st.itemId, st.title, next, st.logged)
}

export function followArrow(s: StoryState, arrowId: string): StoryState {
  const st = s.stage
  if (s.status !== 'playing' || st?.kind !== 'item-end') return s
  const a = st.arrows.find((x) => x.id === arrowId)
  return a ? enterBox(s, a.toBoxId) : s
}

export function viewStory(s: StoryState): StoryView {
  if (s.status === 'stopped' && s.stop)
    return {
      kind: 'stopped',
      ...(s.stage && 'itemId' in s.stage && { itemId: s.stage.itemId }),
      reason: s.stop,
    }
  if (s.status === 'ended' || !s.stage) return { kind: 'end' }
  const st = s.stage
  switch (st.kind) {
    case 'beat':
      return { kind: 'beat', boxId: st.boxId, text: st.text }
    case 'item-end':
      return { kind: 'item-end', arrows: st.arrows }
    case 'script':
      return { kind: 'script', itemId: st.itemId, title: st.title, lines: st.lines }
    case 'conversation': {
      const node = st.play.conv.nodes.find((n) => n.id === st.play.current)
      const head = { itemId: st.itemId, title: st.title, nodeId: st.play.current ?? '', loop: st.play.loop }
      if (node?.type === 'lines')
        return {
          kind: 'lines',
          ...head,
          lines: st.play.log[st.play.log.length - 1]?.lines ?? [],
          canContinue: true,
        }
      return { kind: 'choice', ...head, options: [...st.play.options] }
    }
  }
}
