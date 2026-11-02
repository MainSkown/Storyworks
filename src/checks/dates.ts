import { validateDate, type Calendar, type CalendarDate } from '../calendar'
import { compare, type OrderContext, type OrderTimeline } from '../timeline/order'
import { makeFinding, type Finding } from './types'

export interface CheckNode {
  id: string
  title: string
  timelineId: string
  date: CalendarDate | null
}

/** One timeline as the date-order check reads it. */
export interface DateOrderTimeline extends OrderTimeline {
  id: string
  nodes: { id: string; title: string; date: CalendarDate | null }[]
}

const label = (title: string) => title.trim() || '(untitled)'

/** Error: a node date that does not exist in the book's calendar. Undated nodes are skipped. */
export function invalidNodeDates(cal: Calendar, nodes: CheckNode[]): Finding[] {
  const out: Finding[] = []
  for (const n of nodes) {
    if (!n.date) continue
    const r = validateDate(cal, n.date)
    if (r.ok) continue
    out.push(
      makeFinding(
        'invalid-date',
        [n.id],
        `Node "${label(n.title)}" has a date that does not exist in the calendar (invalid ${r.reason}).`,
        [{ kind: 'node', id: n.id, timelineId: n.timelineId, label: label(n.title) }],
        false,
        { variant: r.reason, params: { title: label(n.title) } },
      ),
    )
  }
  return out
}

/**
 * Warning: along a direct edge A -> B both nodes are dated (validly) and B is dated before A.
 * Order comes from the shared `compare`; undated, equal, invalid and unknown cases give nothing.
 * First location is the follower B (the later node), then the predecessor A.
 */
export function dateOrder(cal: Calendar, timelines: DateOrderTimeline[]): Finding[] {
  const byId = new Map(timelines.map((t) => [t.id, t]))
  const ctx: OrderContext = { calendar: cal, timeline: (id) => byId.get(id) }
  const out: Finding[] = []
  const seen = new Set<string>()
  for (const t of timelines) {
    const nodes = new Map(t.nodes.map((n) => [n.id, n]))
    for (const e of t.edges) {
      const a = nodes.get(e.from)
      const b = nodes.get(e.to)
      if (!a || !b || !a.date || !b.date) continue
      const key = `${a.id}:${b.id}`
      if (seen.has(key)) continue
      // With a direct edge A -> B, compare() can only say 'after' by calendar dates.
      const order = compare(
        { node: { timelineId: t.id, nodeId: a.id } },
        { node: { timelineId: t.id, nodeId: b.id } },
        ctx,
      )
      if (order !== 'after') continue
      seen.add(key)
      out.push(
        makeFinding(
          'date-order',
          [a.id, b.id],
          `"${label(b.title)}" comes after "${label(a.title)}" on the timeline but is dated earlier.`,
          [
            { kind: 'node', id: b.id, timelineId: t.id, label: label(b.title) },
            { kind: 'node', id: a.id, timelineId: t.id, label: label(a.title) },
          ],
          false,
          { params: { later: label(b.title), earlier: label(a.title) } },
        ),
      )
    }
  }
  return out
}
