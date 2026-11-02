import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import pl from '../locales/pl.json'
import { polishPlural } from '../i18n/pluralRules'
import { CHECK_IDS, type Finding } from './types'
import { findingText } from './text'

const make = (locale: 'en' | 'pl') =>
  createI18n({
    legacy: false,
    locale,
    messages: { en, pl },
    pluralRules: { pl: polishPlural },
  }).global

const finding = (o: Partial<Finding>): Finding => ({
  id: 'x',
  checkId: 'unlinked-rule',
  severity: 'info',
  message: 'English fallback',
  locations: [],
  ...o,
})

describe('findingText', () => {
  it('builds text from check id and params', () => {
    const f = finding({ params: { title: 'Law' } })
    expect(findingText(make('en'), f)).toBe('Rule "Law" is not linked to anything.')
    expect(findingText(make('pl'), f)).toContain('Law')
  })
  it('uses the variant key', () => {
    const f = finding({
      checkId: 'knowledge-timing',
      variant: 'never-learned',
      params: { entry: 'Ann', item: 'Secret' },
    })
    expect(findingText(make('en'), f)).toBe('Ann uses "Secret" here but never learns it.')
  })
  it('falls back to the message for an unknown check or variant', () => {
    expect(findingText(make('en'), finding({ checkId: 'llm-thing' }))).toBe('English fallback')
    expect(
      findingText(make('en'), finding({ checkId: 'broken-link', variant: 'nope' })),
    ).toBe('English fallback')
    expect(findingText(make('en'), finding({ checkId: 'broken-link' }))).toBe('English fallback')
  })
  it('pluralises by count in both languages', () => {
    const f = (n: string) => finding({ checkId: 'open-todo', params: { title: 'S', count: n } })
    expect(findingText(make('en'), f('1'))).toContain('1 open revision to-do')
    expect(findingText(make('en'), f('3'))).toContain('3 open revision to-dos')
    expect(findingText(make('pl'), f('1'))).toContain('1 otwarte zadanie')
    expect(findingText(make('pl'), f('3'))).toContain('3 otwarte zadania')
    expect(findingText(make('pl'), f('5'))).toContain('5 otwartych zadań')
  })
})

describe('check locale keys', () => {
  const has = (root: Record<string, unknown>, path: string) =>
    path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], root)

  it('every check has a name, a description and a message in both languages', () => {
    for (const messages of [en, pl]) {
      for (const id of CHECK_IDS) {
        for (const ns of ['name', 'desc', 'msg']) {
          expect(has(messages, `checks.${ns}.${id}`), `${ns}.${id}`).toBeTruthy()
        }
      }
    }
  })
})
