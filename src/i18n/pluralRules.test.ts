import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import pl from '../locales/pl.json'
import { polishPlural } from './pluralRules'

describe('Polish plural rule', () => {
  it('picks one / few / other', () => {
    const pick = (n: number) => polishPlural(n, 4)
    expect([1, 2, 4, 5, 12, 14, 21, 22, 25, 112, 0].map(pick)).toEqual([
      1, 2, 2, 3, 3, 3, 3, 2, 3, 3, 3,
    ])
  })

  it('works with the real calendar.noLongerFit message', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'pl',
      messages: { en, pl },
      pluralRules: { pl: polishPlural },
    })
    const t = (n: number) => i18n.global.t('calendar.noLongerFit', n)
    expect(t(1)).toBe('1 data przestanie pasować')
    expect(t(3)).toBe('3 daty przestaną pasować')
    expect(t(5)).toBe('5 dat przestanie pasować')
    expect(t(12)).toBe('12 dat przestanie pasować')
    expect(t(22)).toBe('22 daty przestaną pasować')
  })
})
