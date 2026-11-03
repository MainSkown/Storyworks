import { displayNet, type Day } from './days'
import { shift } from './streak'

/** The last `n` local days ending at `today`, oldest first; missing days are 0, negatives shown as 0. */
export function lastDays(days: Day[], today: string, n: number): Day[] {
  const byDate = new Map(days.map((d) => [d.date, d.net]))
  return Array.from({ length: n }, (_, i) => {
    const date = shift(today, i - (n - 1))
    return { date, net: displayNet(byDate.get(date) ?? 0) }
  })
}
