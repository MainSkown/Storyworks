import type { DictRef } from './types'

/** Bundled dictionary for a book language tag, or null when none fits. */
export function defaultDictionaryFor(language: string): DictRef | null {
  const lang = language.trim().toLowerCase().split(/[-_]/)[0]
  return lang === 'en' || lang === 'pl' ? { name: lang, scope: 'global' } : null
}
