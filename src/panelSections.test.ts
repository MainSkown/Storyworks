import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import pl from './locales/pl.json'
import { panelSections } from './panelSections'
import { sections } from './sections'

const all = Object.entries(panelSections).flatMap(([section, list]) =>
  (list ?? []).map((p) => ({ section, ...p })),
)

describe('panel section registry', () => {
  it('has unique ids', () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length)
  })

  it('namespaces ids by a known app section', () => {
    const known = new Set<string>(sections.map((s) => s.id))
    for (const p of all) {
      expect(p.id.startsWith(`${p.section}.`), p.id).toBe(true)
      expect(known.has(p.section), p.section).toBe(true)
    }
  })

  it('has i18n titles in en and pl', () => {
    const get = (m: unknown, key: string) =>
      key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], m)
    for (const p of all) {
      expect(get(en, p.i18nKey), `en ${p.i18nKey}`).toBeTruthy()
      expect(get(pl, p.i18nKey), `pl ${p.i18nKey}`).toBeTruthy()
    }
  })
})
