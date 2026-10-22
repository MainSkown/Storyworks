import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryProjectIO } from './io/memory'
import { LOCK_PATH, LOCK_REFRESH_MS, createProjectLock } from './lock'

function setup() {
  const io = createMemoryProjectIO()
  let now = 1000
  const lock = createProjectLock(io, {
    now: () => now,
    machine: () => 'laptop',
    pid: () => 100,
    processAlive: async () => false,
  })
  return { io, lock, advance: (ms: number) => (now += ms) }
}

describe('project lock: refresh', () => {
  afterEach(() => vi.useRealTimers())

  it('refresh does not overwrite a lock another holder took', async () => {
    const t = setup()
    await t.lock.acquire()
    const other = JSON.stringify({ machine: 'desktop', pid: 7, timestamp: 5000 })
    t.io.files.set(LOCK_PATH, other)
    expect(await t.lock.refresh()).toBe(false)
    expect(t.io.files.get(LOCK_PATH)).toBe(other)
  })

  it('refresh rewrites a lock file that disappeared', async () => {
    const t = setup()
    await t.lock.acquire()
    t.io.files.delete(LOCK_PATH)
    expect(await t.lock.refresh()).toBe(true)
    expect(t.io.files.has(LOCK_PATH)).toBe(true)
  })

  it('auto-refresh ticks every 30 s and stops on release', async () => {
    vi.useFakeTimers()
    const t = setup()
    await t.lock.acquire()
    t.lock.startAutoRefresh()
    t.advance(LOCK_REFRESH_MS)
    await vi.advanceTimersByTimeAsync(LOCK_REFRESH_MS)
    expect(JSON.parse(t.io.files.get(LOCK_PATH)!).timestamp).toBe(1000 + LOCK_REFRESH_MS)
    await t.lock.release()
    t.advance(LOCK_REFRESH_MS)
    await vi.advanceTimersByTimeAsync(LOCK_REFRESH_MS)
    expect(t.io.files.has(LOCK_PATH)).toBe(false)
  })

  it('auto-refresh reports a lost lock', async () => {
    vi.useFakeTimers()
    const t = setup()
    await t.lock.acquire()
    const onLost = vi.fn()
    t.lock.startAutoRefresh(onLost)
    t.io.files.set(LOCK_PATH, JSON.stringify({ machine: 'desktop', pid: 7, timestamp: 5000 }))
    await vi.advanceTimersByTimeAsync(LOCK_REFRESH_MS)
    expect(onLost).toHaveBeenCalledTimes(1)
  })
})
