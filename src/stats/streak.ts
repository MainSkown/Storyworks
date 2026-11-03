import { displayNet, goalMet, type Day } from './days'

export interface Streaks {
  current: number
  longest: number
}

/** Calendar-day arithmetic on `YYYY-MM-DD` (UTC math, so DST cannot shift a day). */
export function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * Runs of consecutive local days that met the daily goal (or have at least one word when no goal is set).
 * The current streak counts through yesterday when today is not met yet.
 */
export function streaks(days: Day[], today: string, dailyGoal: number | null): Streaks {
  const ok = (net: number) => (dailyGoal && dailyGoal > 0 ? goalMet(net, dailyGoal) : displayNet(net) >= 1)
  const met = new Set(days.filter((d) => ok(d.net)).map((d) => d.date))
  const sorted = [...met].sort()
  let longest = 0
  let run = 0
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && shift(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1
    if (run > longest) longest = run
  }
  let cursor = met.has(today) ? today : shift(today, -1)
  let current = 0
  while (met.has(cursor)) {
    current++
    cursor = shift(cursor, -1)
  }
  return { current, longest }
}
