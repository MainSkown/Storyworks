import type { Condition, Term } from '../project/schemas/condition'
import type { Variable } from '../project/schemas/variables'
import { MAX_STEPS, type StopReason } from './playthrough'
import type { StoryStop } from './storyPlaythrough'
import type { Values } from './conditions'

export interface TextCtx {
  /** Variable name for an id (callers pick the wording for a deleted variable). */
  variableName(id: string): string
  /** Operator label, e.g. "is at least". */
  opLabel(op: Term['op']): string
  /** Node title / first-line snippet. */
  nodeLabel(id: string): string
  /** Word between terms for the match mode, e.g. "and" / "or". */
  joiner(mode: Condition['mode']): string
}

const PREFIX = 'game.conversation.playthrough.stop'

const valueText = (v: unknown) => (typeof v === 'string' ? `"${v}"` : String(v))

export function formatTerm(term: Term, ctx: TextCtx): string {
  const head = `${ctx.variableName(term.variableId)} ${ctx.opLabel(term.op)}`
  return 'value' in term ? `${head} ${valueText(term.value)}` : head
}

export function formatCondition(c: Condition, ctx: TextCtx): string {
  return c.terms.map((t) => formatTerm(t, ctx)).join(` ${ctx.joiner(c.mode)} `)
}

/** Message key and params for a stop reason (the node and variable by name, never by id). */
export function describeStop(
  reason: StopReason,
  ctx: TextCtx,
): { key: string; params: Record<string, string | number> } {
  switch (reason.kind) {
    case 'no-start':
      return { key: `${PREFIX}.noStart`, params: {} }
    case 'empty-conversation':
      return { key: `${PREFIX}.emptyConversation`, params: {} }
    case 'step-limit':
      return { key: `${PREFIX}.stepLimit`, params: { max: MAX_STEPS } }
    case 'node-blocked':
      return {
        key: `${PREFIX}.nodeBlocked`,
        params: {
          node: ctx.nodeLabel(reason.nodeId),
          condition: formatCondition(reason.failedCondition, ctx),
        },
      }
    case 'undefined-variable':
      return {
        key: `${PREFIX}.undefinedVariable`,
        params: {
          node: ctx.nodeLabel(reason.nodeId),
          variable: ctx.variableName(reason.variableId),
        },
      }
    case 'type-mismatch':
      return {
        key: `${PREFIX}.typeMismatch`,
        params: {
          node: ctx.nodeLabel(reason.nodeId),
          variable: ctx.variableName(reason.variableId),
        },
      }
    case 'missing-target':
      return {
        key: reason.optionId ? `${PREFIX}.missingOptionTarget` : `${PREFIX}.missingTarget`,
        params: { node: ctx.nodeLabel(reason.nodeId) },
      }
    case 'no-visible-options':
      return { key: `${PREFIX}.noVisibleOptions`, params: { node: ctx.nodeLabel(reason.nodeId) } }
  }
}

export interface StoryTextCtx extends TextCtx {
  itemTitle(id: string): string
  boxTitle(id: string): string
}

const STORY_PREFIX = 'game.storyPlay.stop'

/** Like describeStop, plus the reasons that only exist across items. */
export function describeStoryStop(
  reason: StoryStop,
  ctx: StoryTextCtx,
): { key: string; params: Record<string, string | number> } {
  switch (reason.kind) {
    case 'broken-link':
      return reason.reason === 'item-missing'
        ? { key: `${STORY_PREFIX}.itemMissing`, params: {} }
        : {
            key: `${STORY_PREFIX}.${reason.reason === 'item-trashed' ? 'itemTrashed' : 'nodeMissing'}`,
            params: { item: ctx.itemTitle(reason.itemId) },
          }
    case 'broken-box':
      return { key: `${STORY_PREFIX}.brokenBox`, params: { box: ctx.boxTitle(reason.boxId) } }
    case 'no-arrow-passes':
      return { key: `${STORY_PREFIX}.noArrowPasses`, params: { box: ctx.boxTitle(reason.boxId) } }
    case 'undefined-variable':
    case 'type-mismatch':
      if (reason.boxId !== undefined)
        return {
          key: `${STORY_PREFIX}.${reason.kind === 'undefined-variable' ? 'arrowUndefinedVariable' : 'arrowTypeMismatch'}`,
          params: { box: ctx.boxTitle(reason.boxId), variable: ctx.variableName(reason.variableId) },
        }
      return describeStop({ kind: reason.kind, variableId: reason.variableId, nodeId: reason.nodeId ?? '' }, ctx)
    default:
      return describeStop(reason, ctx)
  }
}

/** The current value differs from the variable's default. */
export const isChanged = (v: Variable, values: Values): boolean =>
  v.id in values && values[v.id] !== v.default
