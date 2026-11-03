import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { sections } from '../sections'
import { useSettingsStore } from '../settings/store'
import { tourSteps } from './steps'
import { dismissTour, shouldAutoStart, startTour, tourOpen } from './state'
import en from '../locales/en.json'
import pl from '../locales/pl.json'

const get = (o: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o)

describe('tour steps', () => {
  it('point at existing sections, with unique ids', () => {
    const ids = new Set(sections.map((s) => s.id))
    for (const s of tourSteps) {
      expect(ids.has(s.section)).toBe(true)
      expect(s.target).toContain(s.section)
    }
    expect(new Set(tourSteps.map((s) => s.id)).size).toBe(tourSteps.length)
  })
  it('have English and Polish texts', () => {
    for (const s of tourSteps) {
      for (const key of [s.titleKey, s.bodyKey]) {
        expect(typeof get(en, key)).toBe('string')
        expect(typeof get(pl, key)).toBe('string')
      }
    }
  })
})

describe('tour seen flag', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    tourOpen.value = false
  })
  it('is set when the tour is dismissed', () => {
    const settings = useSettingsStore()
    expect(settings.settings.tourSeen).toBe(false)
    startTour()
    expect(tourOpen.value).toBe(true)
    dismissTour()
    expect(tourOpen.value).toBe(false)
    expect(settings.settings.tourSeen).toBe(true)
  })
  it('auto-starts only for an unseen tour with a book open', () => {
    const base = { settingsLoaded: true, seen: false, bookOpen: true, running: false }
    expect(shouldAutoStart(base)).toBe(true)
    expect(shouldAutoStart({ ...base, seen: true })).toBe(false)
    expect(shouldAutoStart({ ...base, bookOpen: false })).toBe(false)
    expect(shouldAutoStart({ ...base, running: true })).toBe(false)
    expect(shouldAutoStart({ ...base, settingsLoaded: false })).toBe(false)
  })
})
