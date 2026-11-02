import type { EntryState } from '../project/schemas/codexEntry'
import type { ChronicleInput, ChronicleRelationship } from './chronicle'

const PER_TIMELINE = 1_000_000

export interface ChronicleSources {
  usage: { timelineId: string; nodeId: string; nodeTitle: string }[]
  /** All timelines in book order; node order is the rank tie-break. */
  timelines: { id: string; nodes: { id: string }[] }[]
  states: EntryState[]
  kindName: (kindId: string) => string
  relationships: (Omit<ChronicleRelationship, 'rank' | 'nodeRef'> & {
    nodeRef: ChronicleRelationship['nodeRef'] | null
  })[]
  untitledNode: string
}

/** Builder input for one entry: nodes ranked by timeline then node order, the rest by given order. */
export function assembleChronicleInput(s: ChronicleSources): ChronicleInput {
  const rankOf = (timelineId: string, nodeId: string): number => {
    const ti = s.timelines.findIndex((t) => t.id === timelineId)
    const ni = ti < 0 ? -1 : s.timelines[ti].nodes.findIndex((n) => n.id === nodeId)
    return (ti < 0 ? s.timelines.length : ti) * PER_TIMELINE + (ni < 0 ? PER_TIMELINE - 1 : ni)
  }
  return {
    nodes: s.usage.map((u) => ({
      timelineId: u.timelineId,
      nodeId: u.nodeId,
      title: u.nodeTitle || s.untitledNode,
      rank: rankOf(u.timelineId, u.nodeId),
    })),
    states: s.states.map((st, i) => ({ ...st, kindName: s.kindName(st.kindId), rank: i })),
    relationships: s.relationships.flatMap((r, i) =>
      r.nodeRef ? [{ ...r, nodeRef: r.nodeRef, rank: i }] : [],
    ),
  }
}
