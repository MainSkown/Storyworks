import type { Stats } from '../project/schemas/stats'

export type Day = Stats['days'][number]

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day of a timestamp, `YYYY-MM-DD`. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Adds `delta` to the day of `at` (a session across midnight is split per edit). Returns a new sorted list. */
export function addToDay(days: Day[], at: number, delta: number): Day[] {
  const date = dayKey(at)
  const i = days.findIndex((d) => d.date === date)
  if (i >= 0) {
    const next = days.slice()
    next[i] = { date, net: days[i].net + delta }
    return next
  }
  return [...days, { date, net: delta }].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** What the app shows for a day: never below 0. */
export const displayNet = (net: number): number => Math.max(0, net)

export const netOn = (days: Day[], date: string): number =>
  displayNet(days.find((d) => d.date === date)?.net ?? 0)

/** Goal met = displayed words reach the daily goal; no goal (null or 0) is never "met". */
export const goalMet = (net: number, goal: number | null): boolean =>
  !!goal && goal > 0 && displayNet(net) >= goal
