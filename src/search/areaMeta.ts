import type { Area } from './index'

/** Icon and section colour tokens per area (Knowledge lives under Codex). */
export const AREA_META: Record<Area, { icon: string; color: string; on: string }> = {
  manuscript: { icon: 'edit', color: '--section-write', on: '--section-write-on' },
  codex: { icon: 'menu_book', color: '--section-codex', on: '--section-codex-on' },
  rules: { icon: 'checklist', color: '--section-rules', on: '--section-rules-on' },
  timelines: { icon: 'event', color: '--section-timelines', on: '--section-timelines-on' },
  gamedoc: { icon: 'description', color: '--section-gamedoc', on: '--section-gamedoc-on' },
  knowledge: { icon: 'lightbulb', color: '--section-codex', on: '--section-codex-on' },
}

export const areaStyle = (area: Area) => ({
  '--area': `var(${AREA_META[area].color})`,
  '--area-on': `var(${AREA_META[area].on})`,
})
