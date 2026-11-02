// Plain-word labels for change items: "Chapter 3 – Scene 2: edited". Text comes from `t`.
import type { ChangeItem } from './items'
import type { ItemType } from './manifestView'

export type ItemGroup = 'manuscript' | 'timelines' | 'rules' | 'codex' | 'other'

const GROUPS: Partial<Record<ItemType, ItemGroup>> = {
  part: 'manuscript', chapter: 'manuscript', scene: 'manuscript',
  timeline: 'timelines', calendar: 'timelines',
  rule: 'rules', ruleCategory: 'rules',
  entry: 'codex', codexType: 'codex', relationType: 'codex', relationship: 'codex',
  group: 'codex', stateKind: 'codex', knowledge: 'codex',
}

export const GROUP_ORDER: ItemGroup[] = ['manuscript', 'timelines', 'rules', 'codex', 'other']

export const itemGroup = (type: ItemType): ItemGroup => GROUPS[type] ?? 'other'

/** Items whose own title says what they are (manuscript) or that have none (settings, calendar, …). */
const NAMED_BY_TITLE = new Set<ItemType>(['part', 'chapter', 'scene'])
const TYPE_ONLY = new Set<ItemType>(['settings', 'calendar', 'inbox', 'ignoredFindings', 'relationLayout'])

export function itemLabel(item: ChangeItem, t: (key: string) => string): string {
  const kinds = item.kinds.map((k) => t(`history.kind.${k}`)).join(', ')
  let name: string
  if (NAMED_BY_TITLE.has(item.type)) name = [...item.context, item.title].filter(Boolean).join(' – ')
  else if (TYPE_ONLY.has(item.type) || !item.title) name = t(`history.type.${item.type}`)
  else name = `${t(`history.type.${item.type}`)}: ${item.title}`
  return `${name}: ${kinds}`
}
