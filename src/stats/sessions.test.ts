import { describe, expect, it } from 'vitest'
import { createSessionTracker, IDLE_MS, upsertSession } from './sessions'

const MIN = 60_000
const T0 = new Date(2026, 5, 1, 10, 0, 0).getTime()
let n = 0
const make = () => createSessionTracker(() => `s${++n}`)

describe('session tracker', () => {
  it('has no session before the first edit', () => {
    const t = make()
    expect(t.current()).toBeNull()
    expect(t.close()).toBeNull()
  })

  it('starts at the first edit and sums deltas', () => {
    const t = make()
    t.edit(T0, 5)
    const r = t.edit(T0 + MIN, -2)
    expect(r.closed).toBeNull()
    expect(r.current).toMatchObject({
      start: new Date(T0).toISOString(),
      end: new Date(T0 + MIN).toISOString(),
      net: 3,
    })
  })

  it('stays open when the gap is just under 10 minutes', () => {
    const t = make()
    const a = t.edit(T0, 1).current
    const r = t.edit(T0 + IDLE_MS - 1, 1)
    expect(r.closed).toBeNull()
    expect(r.current.id).toBe(a.id)
  })

  it('ends when the gap is exactly 10 minutes; the new edit starts a new session', () => {
    const t = make()
    const a = t.edit(T0, 4).current
    const r = t.edit(T0 + IDLE_MS, 7)
    expect(r.closed).toMatchObject({ id: a.id, net: 4, end: new Date(T0).toISOString() })
    expect(r.current).toMatchObject({ net: 7, start: new Date(T0 + IDLE_MS).toISOString() })
    expect(r.current.id).not.toBe(a.id)
  })

  it('close() returns the session ended at its last edit, then nothing is open', () => {
    const t = make()
    t.edit(T0, 3)
    t.edit(T0 + 2 * MIN, 3)
    expect(t.close()).toMatchObject({ net: 6, end: new Date(T0 + 2 * MIN).toISOString() })
    expect(t.current()).toBeNull()
    expect(t.close()).toBeNull()
  })

  it('isActive is false once the idle limit passed', () => {
    const t = make()
    t.edit(T0, 1)
    expect(t.isActive(T0 + IDLE_MS - 1)).toBe(true)
    expect(t.isActive(T0 + IDLE_MS)).toBe(false)
  })
})

describe('upsertSession', () => {
  it('replaces a session with the same id and appends a new one', () => {
    const a = { id: 'a', start: 's', end: 'e', net: 1 }
    const list = upsertSession([a], { ...a, net: 5 })
    expect(list).toEqual([{ ...a, net: 5 }])
    expect(upsertSession(list, { ...a, id: 'b' })).toHaveLength(2)
  })
})
