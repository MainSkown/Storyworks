import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import pl from './locales/pl.json'
import { hiddenSectionRedirect, sections, sectionsFor } from './sections'

describe('section registry', () => {
  it('has unique ids and route names', () => {
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length)
    expect(new Set(sections.map((s) => s.routeName)).size).toBe(sections.length)
  })

  it('has i18n names in en and pl', () => {
    for (const s of sections) {
      const key = s.i18nKey.split('.')[1]!
      expect((en.sections as Record<string, string>)[key], `en ${key}`).toBeTruthy()
      expect((pl.sections as Record<string, string>)[key], `pl ${key}`).toBeTruthy()
    }
  })

  it('has the 6 main and 4 bottom sections', () => {
    expect(sections.filter((s) => s.position === 'main')).toHaveLength(6)
    expect(sections.filter((s) => s.position === 'bottom')).toHaveLength(4)
  })

  it('book and screenplay hide Story map; game hides Export until S6', () => {
    for (const kind of ['book', 'screenplay']) {
      const ids = sectionsFor(kind).map((s) => s.id)
      expect(ids).not.toContain('storymap')
      expect(ids).toContain('export')
    }
    const ids = sectionsFor('game').map((s) => s.id)
    expect(ids).not.toContain('export')
    expect(ids).toContain('storymap')
    expect(ids.indexOf('storymap')).toBe(ids.indexOf('write') + 1)
  })

  it('a hidden section route redirects to write; others are left alone', () => {
    expect(hiddenSectionRedirect('game', 'export')).toEqual({ name: 'write' })
    expect(hiddenSectionRedirect('book', 'storymap')).toEqual({ name: 'write' })
    expect(hiddenSectionRedirect('screenplay', 'storymap')).toEqual({ name: 'write' })
    expect(hiddenSectionRedirect('game', 'storymap')).toBeNull()
    expect(hiddenSectionRedirect('screenplay', 'export')).toBeNull()
    expect(hiddenSectionRedirect('book', 'export')).toBeNull()
    expect(hiddenSectionRedirect('game', 'codex')).toBeNull()
    expect(hiddenSectionRedirect('game', 'relationships')).toBeNull()
    expect(hiddenSectionRedirect('game', 'welcome')).toBeNull()
  })
})
