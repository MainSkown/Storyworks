import { describe, expect, it, vi } from 'vitest'
import { createMemoryProjectIO } from '../project/io/memory'
import type { Env } from '../project/types'
import { listBackups, makeBackup, makeBackupIfChanged, pruneBackups, startBackupScheduler } from './backups'

function setup() {
  let t = Date.UTC(2026, 10, 2, 12, 0, 0)
  const env: Env = { now: () => (t += 60_000), newId: () => 'id' }
  const io = createMemoryProjectIO({
    'project.json': '{}',
    'manuscript/s1.json': 's1',
    'assets/a.png': 'img',
    '.storyworks/lock': 'x',
    '.storyworks/backups/pre-migration-v10-2026-11-01T08-00-00-000Z/project.json': 'old',
  })
  return { env, io }
}

const autos = async (io: ReturnType<typeof setup>['io']) => (await listBackups(io)).filter((b) => b.kind === 'auto')

describe('makeBackup', () => {
  it('copies the project but not .storyworks, into a named folder', async () => {
    const { env, io } = setup()
    const name = await makeBackup(io, env, 'auto')
    expect(name).toBe('auto-2026-11-02T12-01-00-000Z')
    const dir = `.storyworks/backups/${name}`
    expect(io.files.get(`${dir}/project.json`)).toBe('{}')
    expect(io.files.get(`${dir}/manuscript/s1.json`)).toBe('s1')
    expect(io.files.get(`${dir}/assets/a.png`)).toBe('img')
    expect([...io.files.keys()].some((p) => p.startsWith(`${dir}/.storyworks`))).toBe(false)
  })
})

describe('listBackups', () => {
  it('lists every kind newest first with kind and time', async () => {
    const { env, io } = setup()
    const a = await makeBackup(io, env, 'auto')
    const s = await makeBackup(io, env, 'safety')
    const list = await listBackups(io)
    expect(list.map((b) => [b.name, b.kind])).toEqual([
      [s, 'safety'],
      [a, 'auto'],
      ['pre-migration-v10-2026-11-01T08-00-00-000Z', 'pre-migration'],
    ])
    expect(list[0].time).toBe('2026-11-02T12:02:00.000Z')
  })

  it('ignores unknown folders', async () => {
    const { io } = setup()
    io.files.set('.storyworks/backups/other/x.json', 'x')
    expect((await listBackups(io)).map((b) => b.kind)).toEqual(['pre-migration'])
  })
})

describe('pruneBackups', () => {
  it('keeps the newest N of each kind and never touches pre-migration backups', async () => {
    const { env, io } = setup()
    const a: string[] = []
    for (let i = 0; i < 5; i++) a.push(await makeBackup(io, env, 'auto'))
    const s: string[] = []
    for (let i = 0; i < 4; i++) s.push(await makeBackup(io, env, 'safety'))
    await pruneBackups(io, { keepAuto: 2, keepSafety: 3 })
    const names = (await listBackups(io)).map((b) => b.name)
    expect(names.filter((n) => n.startsWith('auto-'))).toEqual([a[4], a[3]])
    expect(names.filter((n) => n.startsWith('safety-'))).toEqual([s[3], s[2], s[1]])
    expect(names.some((n) => n.startsWith('pre-migration'))).toBe(true)
    expect([...io.files.keys()].some((p) => p.includes(a[0]))).toBe(false)
  })
})

describe('makeBackupIfChanged', () => {
  it('skips when nothing changed since the last automatic backup', async () => {
    const { env, io } = setup()
    expect(await makeBackupIfChanged(io, env)).not.toBeNull()
    expect(await makeBackupIfChanged(io, env)).toBeNull()
    await io.writeTextAtomic('manuscript/s1.json', 's1b')
    expect(await makeBackupIfChanged(io, env)).not.toBeNull()
    expect(await autos(io)).toHaveLength(2)
  })

  it('ignores changes under .storyworks', async () => {
    const { env, io } = setup()
    await makeBackupIfChanged(io, env)
    await io.writeTextAtomic('.storyworks/lock', 'y')
    expect(await makeBackupIfChanged(io, env)).toBeNull()
  })
})

describe('startBackupScheduler', () => {
  const settings = (over: Partial<{ intervalMinutes: number; keep: number; onClose: boolean }> = {}) => ({
    intervalMinutes: 1, keep: 2, onClose: true, ...over,
  })

  it('backs up on the interval when something changed, then prunes', async () => {
    vi.useFakeTimers()
    const { env, io } = setup()
    const s = startBackupScheduler({ io, env, getSettings: () => settings() })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await autos(io)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await autos(io)).toHaveLength(1)
    for (let i = 0; i < 3; i++) {
      await io.writeTextAtomic('manuscript/s1.json', `v${i}`)
      await vi.advanceTimersByTimeAsync(60_000)
    }
    expect(await autos(io)).toHaveLength(2)
    s.stop()
    vi.useRealTimers()
  })

  it('does nothing when the interval is 0', async () => {
    vi.useFakeTimers()
    const { env, io } = setup()
    const s = startBackupScheduler({ io, env, getSettings: () => settings({ intervalMinutes: 0 }) })
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(await autos(io)).toHaveLength(0)
    s.stop()
    vi.useRealTimers()
  })

  it('runOnClose backs up only when enabled', async () => {
    const { env, io } = setup()
    const off = startBackupScheduler({ io, env, getSettings: () => settings({ onClose: false }) })
    await off.runOnClose()
    expect(await autos(io)).toHaveLength(0)
    off.stop()
    const on = startBackupScheduler({ io, env, getSettings: () => settings() })
    await on.runOnClose()
    expect(await autos(io)).toHaveLength(1)
    on.stop()
  })

  it('a failing backup does not stop the timer', async () => {
    vi.useFakeTimers()
    const { env, io } = setup()
    let fail = true
    const orig = io.copyTree
    io.copyTree = async (...a) => {
      if (fail) throw new Error('disk')
      return orig(...a)
    }
    const s = startBackupScheduler({ io, env, getSettings: () => settings(), onError: () => {} })
    await vi.advanceTimersByTimeAsync(60_000)
    fail = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await autos(io)).toHaveLength(1)
    s.stop()
    vi.useRealTimers()
  })
})
