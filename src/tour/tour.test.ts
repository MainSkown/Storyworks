import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { sectionsFor } from '../sections'
import { KIND_IDS } from '../project/kinds'
import { useSettingsStore } from '../settings/store'
import { tourStepsByKind, tourStepsFor } from './steps'
import { dismissTour, shouldAutoStart, startTour, tourOpen } from './state'
import en from '../locales/en.json'
import pl from '../locales/pl.json'

const get = (o: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o)

const allSteps = KIND_IDS.flatMap((k) => tourStepsByKind[k])

describe('tour steps', () => {
  it.each(KIND_IDS)('%s: 5 or 6 steps, each on a section that kind shows', (kind) => {
    const steps = tourStepsByKind[kind]
    expect(steps.length).toBeGreaterThanOrEqual(5)
    expect(steps.length).toBeLessThanOrEqual(6)
    const visible = new Set(sectionsFor(kind).map((s) => s.id))
    for (const s of steps) {
      expect(s.kind).toBe(kind)
      expect(visible.has(s.section)).toBe(true)
      expect(s.target).toContain(s.section)
    }
  })
  it('have unique ids across kinds', () => {
    expect(new Set(allSteps.map((s) => s.id)).size).toBe(allSteps.length)
  })
  it('have English and Polish texts', () => {
    for (const s of allSteps) {
      for (const key of [s.titleKey, s.bodyKey]) {
        expect(typeof get(en, key)).toBe('string')
        expect(typeof get(pl, key)).toBe('string')
      }
    }
  })
  it('are picked by kind, with book steps for no or an unknown kind', () => {
    expect(tourStepsFor('game')).toBe(tourStepsByKind.game)
    expect(tourStepsFor('screenplay')).toBe(tourStepsByKind.screenplay)
    expect(tourStepsFor(undefined)).toBe(tourStepsByKind.book)
    expect(tourStepsFor('novella')).toBe(tourStepsByKind.book)
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
