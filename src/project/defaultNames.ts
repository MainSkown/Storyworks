/** Names written into new project files; the book language picks the set (same rule as the calendar). */
export type DefaultLang = 'en' | 'pl'

export const defaultLang = (language: string): DefaultLang =>
  language.startsWith('pl') ? 'pl' : 'en'

const NAMES = {
  en: {
    chapter: 'Chapter 1',
    sequence: 'Sequence 1',
    scene: 'Scene 1',
    timeline: 'Main timeline',
    // Same order as DEFAULT_RULE_CATEGORIES / DEFAULT_CODEX_TYPES.
    ruleCategories: ['Magic', 'Physics', 'Society', 'Technology', 'Religion'],
    // Same order as DEFAULT_MECHANIC_CATEGORIES.
    mechanicCategories: ['Core loop', 'Combat', 'Economy', 'Progression', 'Exploration', 'Interface'],
    overviewHeadings: ['Pitch', 'Pillars', 'Audience', 'Core loop'],
    codexTypes: ['Character', 'Item', 'Place', 'Country', 'Town', 'Building'],
    // Same order as DEFAULT_RELATION_TYPES.
    relationTypes: [
      { name: 'Friend', reverseLabel: '' },
      { name: 'Enemy', reverseLabel: '' },
      { name: 'Parent', reverseLabel: 'Child' },
      { name: 'Sibling', reverseLabel: '' },
      { name: 'Lover', reverseLabel: '' },
      { name: 'Located in', reverseLabel: 'Contains' },
      { name: 'Owns', reverseLabel: 'Owned by' },
    ],
    // Same order as DEFAULT_STATE_KINDS.
    stateKinds: ['Location', 'Owner', 'Status', 'Title'],
  },
  pl: {
    chapter: 'Rozdział 1',
    sequence: 'Sekwencja 1',
    scene: 'Scena 1',
    timeline: 'Główna oś czasu',
    ruleCategories: ['Magia', 'Fizyka', 'Społeczeństwo', 'Technologia', 'Religia'],
    mechanicCategories: ['Główna pętla', 'Walka', 'Ekonomia', 'Rozwój', 'Eksploracja', 'Interfejs'],
    overviewHeadings: ['Założenie', 'Filary', 'Odbiorcy', 'Główna pętla'],
    codexTypes: ['Postać', 'Przedmiot', 'Miejsce', 'Kraj', 'Miasto', 'Budynek'],
    relationTypes: [
      { name: 'Przyjaciel', reverseLabel: '' },
      { name: 'Wróg', reverseLabel: '' },
      { name: 'Rodzic', reverseLabel: 'Dziecko' },
      { name: 'Rodzeństwo', reverseLabel: '' },
      { name: 'Partner', reverseLabel: '' },
      { name: 'Znajduje się w', reverseLabel: 'Zawiera' },
      { name: 'Posiada', reverseLabel: 'Należy do' },
    ],
    stateKinds: ['Lokalizacja', 'Właściciel', 'Status', 'Tytuł'],
  },
} as const

export const defaultNames = (language: string) => NAMES[defaultLang(language)]

/** Starter type names that the POV picker lists first. */
export const CHARACTER_TYPE_NAMES: readonly string[] = ['character', 'postać']
