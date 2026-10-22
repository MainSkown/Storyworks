export type SectionId =
  'write' | 'timelines' | 'rules' | 'codex' | 'checks' | 'stats' | 'history' | 'settings'

export interface AppSection {
  id: SectionId
  /** Key in the `sections.*` i18n namespace. */
  i18nKey: `sections.${SectionId}`
  /** CSS custom property holding the section colour. */
  colorVar: string
  /** CSS custom property for text/icons drawn on the section colour. */
  onColorVar: string
  icon: string
  routeName: SectionId
  position: 'main' | 'bottom'
}

const coloured = (
  id: SectionId,
  icon: string,
  position: AppSection['position'] = 'main',
): AppSection => ({
  id,
  i18nKey: `sections.${id}`,
  colorVar: `--section-${id}`,
  onColorVar: `--section-${id}-on`,
  icon,
  routeName: id,
  position,
})

const neutral = (id: SectionId, icon: string): AppSection => ({
  id,
  i18nKey: `sections.${id}`,
  colorVar: '--text-secondary',
  onColorVar: '--bg-sheet',
  icon,
  routeName: id,
  position: 'bottom',
})

export const sections: readonly AppSection[] = [
  coloured('write', 'edit'),
  coloured('timelines', 'event'),
  coloured('rules', 'checklist'),
  coloured('codex', 'menu_book'),
  coloured('checks', 'warning'),
  neutral('stats', 'bar_chart'),
  neutral('history', 'history'),
  neutral('settings', 'settings'),
]

export function sectionByRouteName(name: unknown): AppSection | undefined {
  return sections.find((s) => s.routeName === name)
}
