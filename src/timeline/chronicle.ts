import type { CalendarDate } from '../calendar'
import type { StateLike } from '../project/stateChecks'
import { sortChronologicalDetailed } from './chrono'
import { positionDate, type OrderContext, type Position } from './order'

export interface ChronicleNode {
  timelineId: string
  nodeId: string
  title: string
  rank: number
}
export type ChronicleState = StateLike & { rank: number; kindName: string }
export interface ChronicleRelationship {
  id: string
  label: string
  otherName: string
  nodeRef: { timelineId: string; nodeId: string }
  rank: number
}
export interface ChronicleExtra {
  id: string
  label: string
  position: Position | null
  rank: number
  kind: string
}

export interface ChronicleInput {
  nodes: ChronicleNode[]
  states: ChronicleState[]
  relationships: ChronicleRelationship[]
  /** Other dated events (knowledge later); `kind` names the row kind and id prefix. */
  extra?: ChronicleExtra[]
}

export type ChronicleTarget =
  | { type: 'node'; timelineId: string; nodeId: string }
  | { type: 'state'; stateId: string }
  | { type: 'relationship'; relationshipId: string }
  | { type: 'extra'; kind: string; id: string }

export interface ChronicleRow {
  /** Unique within one chronicle: `<kind>:<id>`. */
  id: string
  kind: string
  label: string
  position: Position | null
  /** In-world date of the position; null when undated or the node is missing. */
  date: CalendarDate | null
  /** False when the row's place in time is unknown and it is listed after the ordered ones. */
  determined: boolean
  target: ChronicleTarget
  /** States only. */
  value?: string
  until?: Position | null
  final?: boolean
  /** Relationships only. */
  otherName?: string
}

const byRank = <T extends { rank: number }>(list: T[]) => list.map((x, i) => [x, i] as const).sort((a, b) => a[0].rank - b[0].rank || a[1] - b[1]).map(([x]) => x)

/**
 * Rows for one entry's page, in chronological order. Ties and unknown order fall back to
 * kind (nodes, states, relationships, extra), then the given rank. Unresolvable rows stay, last.
 */
export function buildChronicle(input: ChronicleInput, ctx: OrderContext): ChronicleRow[] {
  const rows: Omit<ChronicleRow, 'date' | 'determined'>[] = []
  for (const n of byRank(input.nodes))
    rows.push({
      id: `node:${n.timelineId}:${n.nodeId}`,
      kind: 'node',
      label: n.title,
      position: { node: { timelineId: n.timelineId, nodeId: n.nodeId } },
      target: { type: 'node', timelineId: n.timelineId, nodeId: n.nodeId },
    })
  for (const s of byRank(input.states))
    rows.push({
      id: `state:${s.id}`,
      kind: 'state',
      label: s.kindName,
      position: s.from,
      target: { type: 'state', stateId: s.id },
      value: s.value,
      until: s.until,
      final: s.final,
    })
  for (const r of byRank(input.relationships))
    rows.push({
      id: `relationship:${r.id}`,
      kind: 'relationship',
      label: r.label,
      position: { node: r.nodeRef },
      target: { type: 'relationship', relationshipId: r.id },
      otherName: r.otherName,
    })
  for (const e of byRank(input.extra ?? []))
    rows.push({
      id: `${e.kind}:${e.id}`,
      kind: e.kind,
      label: e.label,
      position: e.position,
      target: { type: 'extra', kind: e.kind, id: e.id },
    })

  // Rank is the final position in the concatenation above: kind groups first, then given rank.
  return sortChronologicalDetailed(
    rows.map((row, i) => ({ key: row, position: row.position, rank: i })),
    ctx,
  ).map(({ key, determined }) => ({
    ...key,
    determined,
    date: key.position ? positionDate(key.position, ctx) : null,
  }))
}
