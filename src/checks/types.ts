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
}

export type LocationKind = 'scene' | 'node' | 'rule' | 'entry' | 'file'

/** Where a finding points; `blockId` only for a passage inside a scene, `timelineId` only for a node. */
export interface FindingLocation {
  kind: LocationKind
  id: string
  blockId?: string
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
