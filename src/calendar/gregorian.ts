import { CALENDAR_VERSION, type Calendar, type LeapRule } from './schema'

export const GREGORIAN_LEAP: LeapRule = {
  month: 1,
  extraDays: 1,
  every: 4,
  exceptEvery: 100,
  unlessEvery: 400,
}

export type PresetLanguage = 'en' | 'pl'

const MONTHS: [string, number][] = [
  ['January', 31],
  ['February', 28],
  ['March', 31],
  ['April', 30],
  ['May', 31],
  ['June', 30],
  ['July', 31],
  ['August', 31],
  ['September', 30],
  ['October', 31],
  ['November', 30],
  ['December', 31],
]

const PL_MONTHS = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
]
const EN_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const PL_WEEKDAYS = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']

/** The Gregorian preset; month and weekday names follow `lang` (default English). */
export function gregorianCalendar(id: string, lang: PresetLanguage = 'en'): Calendar {
  const pl = lang === 'pl'
  return {
    version: CALENDAR_VERSION,
    id,
    months: MONTHS.map(([name, days], i) => ({ name: pl ? PL_MONTHS[i] : name, days })),
    weekdays: [...(pl ? PL_WEEKDAYS : EN_WEEKDAYS)],
    eras: [],
    leap: { ...GREGORIAN_LEAP },
  }
}
