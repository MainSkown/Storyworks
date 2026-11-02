import { useI18n } from 'vue-i18n'
import { formatDate } from '../../calendar'
import type { Position } from '../../timeline/order'
import { useTimelinesStore } from '../../timeline/store'
import { describePosition } from '../states/position'

/** Readable text of a position: a date, or "Event (Timeline)"; `missing` when the event is gone. */
export function usePositionText() {
  const { t } = useI18n()
  const timelines = useTimelinesStore()
  return (p: Position): { text: string; missing: boolean } => {
    const v = describePosition(p, timelines.loadedTimelines, (d) => formatDate(timelines.calendar, d))
    if (v.kind === 'date') return { text: v.date, missing: false }
    if (v.kind === 'missing-event') return { text: t('states.position.missingEvent'), missing: true }
    return {
      text: `${v.title || t('states.position.untitledEvent')} (${v.timelineName})`,
      missing: false,
    }
  }
}
