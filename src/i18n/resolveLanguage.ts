export type AppLanguage = 'en' | 'pl'

export function resolveLanguage(systemLocale: string): AppLanguage {
  const base = systemLocale.toLowerCase().split(/[-_]/)[0]
  return base === 'pl' ? 'pl' : 'en'
}
