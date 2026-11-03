import { describe, expect, it } from 'vitest'
import { lastDays } from './series'

describe('lastDays', () => {
  it('returns n days ending today, oldest first, zero-filled', () => {
    const r = lastDays([{ date: '2026-06-02', net: 40 }], '2026-06-03', 3)
    expect(r).toEqual([
      { date: '2026-06-01', net: 0 },
      { date: '2026-06-02', net: 40 },
      { date: '2026-06-03', net: 0 },
    ])
  })

  it('crosses month and year boundaries and floors negative days at 0', () => {
    const r = lastDays([{ date: '2025-12-31', net: -5 }], '2026-01-02', 3)
    expect(r.map((d) => d.date)).toEqual(['2025-12-31', '2026-01-01', '2026-01-02'])
    expect(r[0].net).toBe(0)
  })
})
