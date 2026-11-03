import { isKindId, type KindId } from '../project/kinds'

export type Severity = 'error' | 'warning' | 'info'

export const CHECK_IDS = [
  'broken-link',
  'invalid-file',
  'invalid-date',
  'date-order',
  'duplicate-name',
  'state-overlap',
  'appearance-after-final',
  'knowledge-timing',
  'node-no-passage',
  'scene-no-links',
  'isolated-node',
  'unlinked-rule',
  'entry-no-connections',
  'open-todo',
  'dead-end',
  'unreachable-node',
  'unreachable-item',
  'choice-no-target',
  'undefined-variable',
  'route-unreachable',
  'broken-speaker',
  'mechanic-broken-link',
  'mechanic-no-links',
  'variable-unused',
] as const

export type CheckId = (typeof CHECK_IDS)[number]

export const CHECK_SEVERITY: Record<CheckId, Severity> = {
  'broken-link': 'error',
  'invalid-file': 'error',
  'invalid-date': 'error',
  'date-order': 'warning',
  'duplicate-name': 'warning',
  'state-overlap': 'warning',
  'appearance-after-final': 'warning',
  'knowledge-timing': 'warning',
  'node-no-passage': 'info',
  'scene-no-links': 'info',
  'isolated-node': 'info',
  'unlinked-rule': 'info',
  'entry-no-connections': 'info',
  'open-todo': 'info',
  'dead-end': 'warning',
  'unreachable-node': 'warning',
  'unreachable-item': 'warning',
  'choice-no-target': 'error',
  'undefined-variable': 'error',
  'route-unreachable': 'warning',
  'broken-speaker': 'error',
  'mechanic-broken-link': 'error',
  'mechanic-no-links': 'info',
  'variable-unused': 'info',
}

const ALL_KINDS: KindId[] = ['book', 'screenplay', 'game']
const GAME_ONLY: KindId[] = ['game']

/** Project kinds a check applies to; the runner and the settings list skip the others. */
export const CHECK_KINDS: Record<CheckId, KindId[]> = {
  'broken-link': ALL_KINDS,
  'invalid-file': ALL_KINDS,
  'invalid-date': ALL_KINDS,
  'date-order': ALL_KINDS,
  'duplicate-name': ALL_KINDS,
  'state-overlap': ALL_KINDS,
  'appearance-after-final': ALL_KINDS,
  'knowledge-timing': ALL_KINDS,
  'node-no-passage': ALL_KINDS,
  'scene-no-links': ALL_KINDS,
  'isolated-node': ALL_KINDS,
  'unlinked-rule': ALL_KINDS,
  'entry-no-connections': ALL_KINDS,
  'open-todo': ALL_KINDS,
  'dead-end': GAME_ONLY,
  'unreachable-node': GAME_ONLY,
  'unreachable-item': GAME_ONLY,
  'choice-no-target': GAME_ONLY,
  'undefined-variable': GAME_ONLY,
  'route-unreachable': GAME_ONLY,
  'broken-speaker': GAME_ONLY,
  'mechanic-broken-link': GAME_ONLY,
  'mechanic-no-links': GAME_ONLY,
  'variable-unused': GAME_ONLY,
}

export const checksForKind = (kind: KindId): CheckId[] =>
  CHECK_IDS.filter((id) => CHECK_KINDS[id].includes(kind))

export type LocationKind = 'scene' | 'node' | 'rule' | 'entry' | 'file' | 'item' | 'mechanic' | 'variable'

/** Where a finding points; `blockId` only for a passage inside a scene, `timelineId` only for a node, `nodeId` only for a conversation node of an `item`. */
export interface FindingLocation {
  kind: LocationKind
  id: string
  blockId?: string
  nodeId?: string
  timelineId?: string
  /** Human label (title, name or snippet), already resolved by the checker. */
  label: string
}

/** Shared by every checker, including a later LLM one. `message` is the English fallback; the UI localises by `checkId`, `variant` and `params`. */
export interface Finding {
  id: string
  checkId: string
  severity: Severity
  message: string
  locations: FindingLocation[]
  /** Picks one of several texts for a check (e.g. which knowledge-timing reason). */
  variant?: string
  /** Values for the localised text (names, titles). */
  params?: Record<string, string>
}

/** Stable id: check id plus involved ids. Pass `symmetric` when the order of `ids` carries no meaning. */
export function findingId(checkId: string, ids: readonly string[], symmetric = false): string {
  const parts = symmetric ? [...ids].sort() : [...ids]
  return [checkId, ...parts].join(':')
}

export function makeFinding(
  checkId: CheckId,
  ids: readonly string[],
  message: string,
  locations: FindingLocation[],
  symmetric = false,
  extra?: { variant?: string; params?: Record<string, string> },
): Finding {
  return {
    id: findingId(checkId, ids, symmetric),
    checkId,
    severity: CHECK_SEVERITY[checkId],
    message,
    locations,
    ...extra,
  }
}

/** The manifest's kind as a known kind (anything unknown counts as a book). */
export const checkKind = (kind: string | undefined): KindId => (kind && isKindId(kind) ? kind : 'book')
