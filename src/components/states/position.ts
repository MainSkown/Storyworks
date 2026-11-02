import type { CalendarDate } from '../../calendar'
import type { PickerTimeline } from '../../timeline/pick'
import { describeTarget } from '../../timeline/pick'
import type { Position } from '../../timeline/order'

export type PositionView =
  | { kind: 'event'; title: string; timelineName: string; date: string }
  | { kind: 'missing-event' }
  | { kind: 'date'; date: string }

/** Display data of a position; a node that is not in a loaded timeline is 'missing-event'. */
export function describePosition(
  position: Position,
  timelines: readonly PickerTimeline[],
  format: (d: CalendarDate) => string,
): PositionView {
  if ('date' in position) return { kind: 'date', date: format(position.date) }
  const target = describeTarget(
    timelines,
    { item: position.node.timelineId, block: position.node.nodeId },
    format,
  )
  return target ? { kind: 'event', ...target } : { kind: 'missing-event' }
}
