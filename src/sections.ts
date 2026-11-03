import { kindProfile } from './project/kinds'

export type SectionId =
  'write' | 'storymap' | 'gamedoc' | 'timelines' | 'rules' | 'codex' | 'checks' | 'stats' | 'history' | 'export' | 'settings'

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
  coloured('storymap', 'account_tree'),
  coloured('gamedoc', 'description'),
  coloured('timelines', 'event'),
  coloured('rules', 'checklist'),
  coloured('codex', 'menu_book'),
  coloured('checks', 'warning'),
  neutral('stats', 'bar_chart'),
  neutral('history', 'history'),
  neutral('export', 'ios_share'),
  neutral('settings', 'settings'),
]

/** Routes that live inside a section but have their own name. */
const SUB_ROUTES: Record<string, SectionId> = {
  relationships: 'codex',
  knowledge: 'codex',
  'knowledge-matrix': 'codex',
}

export function sectionByRouteName(name: unknown): AppSection | undefined {
  const key = typeof name === 'string' ? (SUB_ROUTES[name] ?? name) : name
  return sections.find((s) => s.routeName === key)
}

/** Sections shown for a project kind. */
export const sectionsFor = (kind: string): AppSection[] => {
  const hidden = kindProfile(kind).hiddenSections
  return sections.filter((s) => !hidden.includes(s.id))
}

/** Where to send a route whose section is hidden for this kind; null = leave it. */
export function hiddenSectionRedirect(kind: string, routeName: unknown): { name: 'write' } | null {
  const section = sectionByRouteName(routeName)
  return section && kindProfile(kind).hiddenSections.includes(section.id) ? { name: 'write' } : null
}
