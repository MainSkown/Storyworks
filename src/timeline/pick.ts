export interface PickerNode {
  id: string
  title: string
  tag: string | null
  branchId: string | null
  date: { year: number; month: number; day: number } | null
}

export interface PickerTimeline {
  id: string
  name: string
  branches: { id: string; name: string }[]
  nodes: PickerNode[]
}

export interface PickerRow {
  timelineId: string
  nodeId: string
  title: string
  date: string
  /** tag, else branch name */
  chip: string | null
}

export interface PickerGroup {
  timelineId: string
  name: string
  rows: PickerRow[]
}

type FormatDate = (date: NonNullable<PickerNode['date']>) => string

/** Nodes per timeline matching every word of `query` (title, date, tag, branch, timeline name). */
export function groupPickerNodes(
  timelines: readonly PickerTimeline[],
  query: string,
  formatDate: FormatDate,
): PickerGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const groups: PickerGroup[] = []
  for (const tl of timelines) {
    const rows: PickerRow[] = []
    for (const n of tl.nodes) {
      const branch = tl.branches.find((b) => b.id === n.branchId)?.name ?? null
      const date = n.date ? formatDate(n.date) : ''
      const chip = n.tag ?? branch
      const hay = [n.title, date, n.tag ?? '', branch ?? '', tl.name].join('\n').toLowerCase()
      if (words.every((w) => hay.includes(w)))
        rows.push({ timelineId: tl.id, nodeId: n.id, title: n.title, date, chip })
    }
    if (rows.length) groups.push({ timelineId: tl.id, name: tl.name, rows })
  }
  return groups
}

/** Display data of a link target, or null when the timeline or node is not there. */
export function describeTarget(
  timelines: readonly PickerTimeline[],
  to: { item: string; block?: string | undefined },
  formatDate: FormatDate,
): { timelineName: string; title: string; date: string } | null {
  const tl = timelines.find((t) => t.id === to.item)
  const node = tl?.nodes.find((n) => n.id === to.block)
  if (!tl || !node) return null
  return {
    timelineName: tl.name,
    title: node.title,
    date: node.date ? formatDate(node.date) : '',
  }
}
