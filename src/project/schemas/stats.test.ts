import { describe, expect, it } from 'vitest'
import { emptyStats, statsSchema, STATS_VERSION } from './stats'

const ok = (v: unknown) => statsSchema.safeParse(v).success
const day = { date: '2026-11-03', net: 120 }
const session = { id: 's1', start: '2026-11-03T09:00:00.000Z', end: '2026-11-03T09:40:00.000Z', net: 120 }

describe('stats schema', () => {
  it('accepts the empty file and a filled one', () => {
    expect(ok(emptyStats())).toBe(true)
    expect(ok({ version: STATS_VERSION, days: [day], sessions: [session] })).toBe(true)
  })
  it('allows a negative net (deleted more than written)', () => {
    expect(ok({ version: STATS_VERSION, days: [{ date: '2026-11-03', net: -5 }], sessions: [] })).toBe(true)
  })
  it('rejects a bad date, a fractional net and unknown keys', () => {
    expect(ok({ ...emptyStats(), days: [{ date: '3 Nov', net: 1 }] })).toBe(false)
    expect(ok({ ...emptyStats(), days: [{ date: '2026-11-03', net: 1.5 }] })).toBe(false)
    expect(ok({ ...emptyStats(), extra: 1 })).toBe(false)
  })
  it('rejects the wrong version', () => {
    expect(ok({ ...emptyStats(), version: 99 })).toBe(false)
  })
})
