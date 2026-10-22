import { describe, expect, it, vi } from 'vitest'
import { createMemoryProjectIO } from './io/memory'
import { LOCK_PATH, LOCK_REFRESH_MS, LOCK_STALE_MS, createProjectLock } from './lock'
import type { LockEnv, LockInfo } from './types'

const NOW = 1_000_000_000
const ME = { machine: 'laptop', pid: 100 }

function setup(opts: { lock?: Partial<LockInfo> | string; alive?: number[]; me?: typeof ME } = {}) {
  const me = opts.me ?? ME
  const io = createMemoryProjectIO()
  if (typeof opts.lock === 'string') io.files.set(LOCK_PATH, opts.lock)
  else if (opts.lock)
    io.files.set(
      LOCK_PATH,
      JSON.stringify({ machine: 'laptop', pid: 200, timestamp: NOW, ...opts.lock }),
    )
  let now = NOW
  const processAlive = vi.fn(async (pid: number) => (opts.alive ?? []).includes(pid))
  const env: LockEnv = {
    now: () => now,
    machine: () => me.machine,
    pid: () => me.pid,
    processAlive,
  }
  const lock = createProjectLock(io, env)
  const onDisk = () => JSON.parse(io.files.get(LOCK_PATH) ?? 'null')
  return { io, lock, processAlive, onDisk, advance: (ms: number) => (now += ms) }
}

describe('lock constants', () => {
  it('uses the spec values', () => {
    expect(LOCK_PATH).toBe('.storyworks/project.lock')
    expect(LOCK_REFRESH_MS).toBe(30_000)
    expect(LOCK_STALE_MS).toBe(120_000)
  })
})

describe('project lock: own lifecycle', () => {
  it('acquire with no lock writes machine, pid and timestamp', async () => {
    const t = setup()
    expect(await t.lock.acquire()).toEqual({ status: 'acquired', tookOverStale: false })
    expect(t.onDisk()).toEqual({ machine: 'laptop', pid: 100, timestamp: NOW })
  })

  it('refresh updates the timestamp', async () => {
    const t = setup()
    await t.lock.acquire()
    t.advance(LOCK_REFRESH_MS)
    await t.lock.refresh()
    expect(t.onDisk()).toEqual({ machine: 'laptop', pid: 100, timestamp: NOW + LOCK_REFRESH_MS })
  })

  it('release removes the lock file', async () => {
    const t = setup()
    await t.lock.acquire()
    await t.lock.release()
    expect(t.io.files.has(LOCK_PATH)).toBe(false)
  })

  it('release leaves another holder lock alone', async () => {
    const t = setup()
    await t.lock.acquire()
    const other = JSON.stringify({ machine: 'desktop', pid: 7, timestamp: NOW })
    t.io.files.set(LOCK_PATH, other)
    await t.lock.release()
    expect(t.io.files.get(LOCK_PATH)).toBe(other)
  })

  it('release without acquire does not remove another holder lock', async () => {
    const t = setup({ lock: { machine: 'desktop', pid: 7 } })
    await t.lock.release()
    expect(t.io.files.has(LOCK_PATH)).toBe(true)
  })

  it('own lock (same machine and pid) is acquired again, not a takeover', async () => {
    const t = setup({ lock: { machine: 'laptop', pid: 100, timestamp: NOW - 10_000 } })
    expect(await t.lock.acquire()).toEqual({ status: 'acquired', tookOverStale: false })
  })

  it('own old lock is acquired again, not a takeover', async () => {
    const t = setup({ lock: { machine: 'laptop', pid: 100, timestamp: NOW - 10 * LOCK_STALE_MS } })
    expect(await t.lock.acquire()).toEqual({ status: 'acquired', tookOverStale: false })
  })
})

describe('project lock: fresh lock held by someone else', () => {
  it('same machine, other pid alive, recent: held elsewhere with holder info', async () => {
    const holder = { machine: 'laptop', pid: 200, timestamp: NOW - 5_000 }
    const t = setup({ lock: holder, alive: [200] })
    expect(await t.lock.acquire()).toEqual({ status: 'held-elsewhere', holder })
  })

  it('held elsewhere leaves the lock file untouched', async () => {
    const t = setup({ lock: { timestamp: NOW - 5_000 }, alive: [200] })
    const before = t.io.files.get(LOCK_PATH)
    await t.lock.acquire()
    expect(t.io.files.get(LOCK_PATH)).toBe(before)
  })

  it('other machine, recent: held elsewhere without checking the pid', async () => {
    const holder = { machine: 'desktop', pid: 200, timestamp: NOW - 5_000 }
    const t = setup({ lock: holder, alive: [] })
    expect(await t.lock.acquire()).toEqual({ status: 'held-elsewhere', holder })
    expect(t.processAlive).not.toHaveBeenCalled()
  })

  it('same machine, old timestamp but pid alive: still fresh', async () => {
    const holder = { machine: 'laptop', pid: 200, timestamp: NOW - 10 * LOCK_STALE_MS }
    const t = setup({ lock: holder, alive: [200] })
    expect(await t.lock.acquire()).toEqual({ status: 'held-elsewhere', holder })
  })

  it('just under 2 minutes old is still fresh', async () => {
    const holder = { machine: 'desktop', pid: 200, timestamp: NOW - (LOCK_STALE_MS - 1) }
    const t = setup({ lock: holder })
    expect((await t.lock.acquire()).status).toBe('held-elsewhere')
  })
})

describe('project lock: stale lock', () => {
  it('same machine, recent timestamp but dead pid: taken over', async () => {
    const t = setup({ lock: { timestamp: NOW - 5_000 }, alive: [] })
    expect(await t.lock.acquire()).toEqual({ status: 'acquired', tookOverStale: true })
    expect(t.onDisk()).toEqual({ machine: 'laptop', pid: 100, timestamp: NOW })
  })

  it('same machine, old and dead pid: taken over', async () => {
    const t = setup({ lock: { timestamp: NOW - 10 * LOCK_STALE_MS }, alive: [] })
    expect(await t.lock.acquire()).toEqual({ status: 'acquired', tookOverStale: true })
  })

  it('other machine, older than 2 minutes: taken over', async () => {
    const t = setup({ lock: { machine: 'desktop', timestamp: NOW - LOCK_STALE_MS - 1 } })
    expect(await t.lock.acquire()).toEqual({ status: 'acquired', tookOverStale: true })
    expect(t.onDisk().machine).toBe('laptop')
  })

  it('exactly 2 minutes old counts as stale', async () => {
    const t = setup({ lock: { machine: 'desktop', timestamp: NOW - LOCK_STALE_MS } })
    expect(await t.lock.acquire()).toEqual({ status: 'acquired', tookOverStale: true })
  })

  it('a lock refreshed after acquire is not stale for the next opener', async () => {
    const a = setup()
    await a.lock.acquire()
    a.advance(LOCK_STALE_MS - 1_000)
    await a.lock.refresh()
    a.advance(LOCK_STALE_MS - 1_000)
    const b = createProjectLock(a.io, {
      now: () => NOW + 2 * (LOCK_STALE_MS - 1_000),
      machine: () => 'desktop',
      pid: () => 5,
      processAlive: async () => false,
    })
    expect((await b.acquire()).status).toBe('held-elsewhere')
  })
})

describe('project lock: unreadable lock file', () => {
  it('invalid JSON is treated as stale and replaced', async () => {
    const t = setup({ lock: '{ not json' })
    expect(await t.lock.acquire()).toEqual({ status: 'acquired', tookOverStale: true })
    expect(t.onDisk().pid).toBe(100)
  })

  it('JSON with the wrong shape is treated as stale', async () => {
    const t = setup({ lock: JSON.stringify({ machine: 5 }) })
    expect(await t.lock.acquire()).toEqual({ status: 'acquired', tookOverStale: true })
  })

  it('empty file is treated as stale', async () => {
    const t = setup({ lock: '' })
    expect(await t.lock.acquire()).toEqual({ status: 'acquired', tookOverStale: true })
  })
})
