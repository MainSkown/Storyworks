import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import pl from './locales/pl.json'
import { resolveLanguage, type AppLanguage } from './i18n/resolveLanguage'

export const i18n = createI18n({
  legacy: false,
  locale: resolveLanguage(navigator.language),
  fallbackLocale: 'en',
  messages: { en, pl },
})

export function setLanguage(lang: AppLanguage): void {
  i18n.global.locale.value = lang
}
