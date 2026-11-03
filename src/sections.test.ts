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

  it('has the 5 main and 4 bottom sections', () => {
    expect(sections.filter((s) => s.position === 'main')).toHaveLength(5)
    expect(sections.filter((s) => s.position === 'bottom')).toHaveLength(4)
  })

  it('book and screenplay show every section; game hides Export until S6', () => {
    expect(sectionsFor('book')).toHaveLength(sections.length)
    expect(sectionsFor('screenplay').map((s) => s.id)).toContain('export')
    const ids = sectionsFor('game').map((s) => s.id)
    expect(ids).not.toContain('export')
    expect(ids).toContain('write')
  })

  it('a hidden section route redirects to write; others are left alone', () => {
    expect(hiddenSectionRedirect('game', 'export')).toEqual({ name: 'write' })
    expect(hiddenSectionRedirect('screenplay', 'export')).toBeNull()
    expect(hiddenSectionRedirect('book', 'export')).toBeNull()
    expect(hiddenSectionRedirect('game', 'codex')).toBeNull()
    expect(hiddenSectionRedirect('game', 'relationships')).toBeNull()
    expect(hiddenSectionRedirect('game', 'welcome')).toBeNull()
  })
})
