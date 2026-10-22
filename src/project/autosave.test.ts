import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosaver } from './autosave'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

/** A save whose completion the test controls. */
function controlledSave() {
  const calls: string[] = []
  const pending: Array<{ resolve: () => void; reject: (e: Error) => void }> = []
  const save = (path: string) => {
    calls.push(path)
    return new Promise<void>((resolve, reject) => pending.push({ resolve, reject }))
  }
  return { save, calls, pending }
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe('autosaver', () => {
  it('starts saved and clean', () => {
    const a = createAutosaver({ save: async () => {} })
    expect(a.status).toBe('saved')
    expect(a.isDirty('a')).toBe(false)
  })

  it('default delay is 800 ms', async () => {
    const save = vi.fn(async () => {})
    const a = createAutosaver({ save })
    a.markDirty('a')
    await tick(799)
    expect(save).not.toHaveBeenCalled()
    await tick(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('debounce coalesces edits into one save', async () => {
    const save = vi.fn(async () => {})
    const a = createAutosaver({ save, delayMs: 500 })
    a.markDirty('a')
    await tick(200)
    a.markDirty('a')
    await tick(200)
    a.markDirty('a')
    await tick(499)
    expect(save).not.toHaveBeenCalled()
    await tick(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('a')
  })

  it('each edit restarts the delay', async () => {
    const save = vi.fn(async () => {})
    const a = createAutosaver({ save, delayMs: 500 })
    a.markDirty('a')
    await tick(300)
    a.markDirty('a')
    await tick(300)
    expect(save).not.toHaveBeenCalled()
    await tick(200)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('is dirty from the first edit until the save finishes', async () => {
    const c = controlledSave()
    const a = createAutosaver({ save: c.save, delayMs: 100 })
    a.markDirty('a')
    expect(a.isDirty('a')).toBe(true)
    await tick(100)
    expect(a.isDirty('a')).toBe(true)
    c.pending[0].resolve()
    await tick(0)
    expect(a.isDirty('a')).toBe(false)
  })

  it('status goes saving then saved', async () => {
    const c = controlledSave()
    const a = createAutosaver({ save: c.save, delayMs: 100 })
    a.markDirty('a')
    await tick(100)
    expect(a.status).toBe('saving')
    c.pending[0].resolve()
    await tick(0)
    expect(a.status).toBe('saved')
  })

  it('writes for one path are serial', async () => {
    const c = controlledSave()
    const a = createAutosaver({ save: c.save, delayMs: 100 })
    a.markDirty('a')
    await tick(100)
    a.markDirty('a')
    await tick(100)
    expect(c.calls).toEqual(['a'])
    c.pending[0].resolve()
    await tick(0)
    expect(c.calls).toEqual(['a', 'a'])
    c.pending[1].resolve()
    await tick(0)
    expect(a.isDirty('a')).toBe(false)
  })

  it('different paths do not wait for each other', async () => {
    const c = controlledSave()
    const a = createAutosaver({ save: c.save, delayMs: 100 })
    a.markDirty('a')
    a.markDirty('b')
    await tick(100)
    expect(c.calls.sort()).toEqual(['a', 'b'])
  })

  it('a failed save stays dirty and sets status error', async () => {
    const save = vi.fn(async () => {
      throw new Error('disk full')
    })
    const a = createAutosaver({ save, delayMs: 100 })
    a.markDirty('a')
    await tick(100)
    expect(a.status).toBe('error')
    expect(a.isDirty('a')).toBe(true)
  })

  it('a later successful save clears the error', async () => {
    let fail = true
    const save = vi.fn(async () => {
      if (fail) throw new Error('disk full')
    })
    const a = createAutosaver({ save, delayMs: 100 })
    a.markDirty('a')
    await tick(100)
    expect(a.status).toBe('error')
    fail = false
    a.markDirty('a')
    await tick(100)
    expect(a.status).toBe('saved')
    expect(a.isDirty('a')).toBe(false)
  })

  it('flushAll saves everything dirty without waiting for the timers', async () => {
    const save = vi.fn(async () => {})
    const a = createAutosaver({ save, delayMs: 10_000 })
    a.markDirty('a')
    a.markDirty('b')
    await a.flushAll()
    expect(save).toHaveBeenCalledTimes(2)
    expect(a.isDirty('a')).toBe(false)
    expect(a.isDirty('b')).toBe(false)
    expect(a.status).toBe('saved')
    await tick(10_000)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('flushAll waits for a save already in flight', async () => {
    const c = controlledSave()
    const a = createAutosaver({ save: c.save, delayMs: 100 })
    a.markDirty('a')
    await tick(100)
    let done = false
    const flushed = a.flushAll().then(() => (done = true))
    await tick(0)
    expect(done).toBe(false)
    c.pending[0].resolve()
    await flushed
    expect(done).toBe(true)
  })

  it('dispose stops pending timers', async () => {
    const save = vi.fn(async () => {})
    const a = createAutosaver({ save, delayMs: 100 })
    a.markDirty('a')
    a.dispose()
    await tick(1000)
    expect(save).not.toHaveBeenCalled()
  })
})
