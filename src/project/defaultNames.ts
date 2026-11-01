/** Names written into new project files; the book language picks the set (same rule as the calendar). */
export type DefaultLang = 'en' | 'pl'

export const defaultLang = (language: string): DefaultLang =>
  language.startsWith('pl') ? 'pl' : 'en'

const NAMES = {
  en: {
    chapter: 'Chapter 1',
    scene: 'Scene 1',
    timeline: 'Main timeline',
    // Same order as DEFAULT_RULE_CATEGORIES / DEFAULT_CODEX_TYPES.
    ruleCategories: ['Magic', 'Physics', 'Society', 'Technology', 'Religion'],
    codexTypes: ['Character', 'Item', 'Place', 'Country', 'Town', 'Building'],
  },
  pl: {
    chapter: 'Rozdział 1',
    scene: 'Scena 1',
    timeline: 'Główna oś czasu',
    ruleCategories: ['Magia', 'Fizyka', 'Społeczeństwo', 'Technologia', 'Religia'],
    codexTypes: ['Postać', 'Przedmiot', 'Miejsce', 'Kraj', 'Miasto', 'Budynek'],
  },
} as const

export const defaultNames = (language: string) => NAMES[defaultLang(language)]

/** Starter type names that the POV picker lists first. */
export const CHARACTER_TYPE_NAMES: readonly string[] = ['character', 'postać']
