import { z } from 'zod'
import type { LockEnv, LockInfo, LockResult, ProjectIO } from './types'

export const LOCK_PATH = '.storyworks/project.lock'
export const LOCK_REFRESH_MS = 30_000
export const LOCK_STALE_MS = 120_000

const lockSchema = z.object({
  machine: z.string(),
  pid: z.number().int(),
  timestamp: z.number().finite(),
}) satisfies z.ZodType<LockInfo>

export interface ProjectLock {
  /** Takes the lock unless a live holder has it. Stale or unreadable locks are replaced (`tookOverStale`). */
  acquire(): Promise<LockResult>
  /** Rewrites our lock with a fresh timestamp (also if the file vanished or is unreadable). false = another holder owns it now; left alone. */
  refresh(): Promise<boolean>
  /** Stops auto-refresh and removes the lock file, only if it is still ours. */
  release(): Promise<void>
  /** Refreshes every LOCK_REFRESH_MS until release(); `onLost` fires when another holder took the lock. */
  startAutoRefresh(onLost?: () => void): void
}

export function createProjectLock(io: ProjectIO, env: LockEnv): ProjectLock {
  let timer: ReturnType<typeof setInterval> | undefined

  const mine = (l: LockInfo) => l.machine === env.machine() && l.pid === env.pid()

  /** null = no file; 'invalid' = unreadable or wrong shape. */
  async function readLock(): Promise<LockInfo | null | 'invalid'> {
    const text = await io.readText(LOCK_PATH)
    if (text === null) return null
    try {
      const parsed = lockSchema.safeParse(JSON.parse(text))
      return parsed.success ? parsed.data : 'invalid'
    } catch {
      return 'invalid'
    }
  }

  async function write(): Promise<void> {
    const info: LockInfo = { machine: env.machine(), pid: env.pid(), timestamp: env.now() }
    await io.mkdir('.storyworks')
    await io.writeTextAtomic(LOCK_PATH, JSON.stringify(info))
  }

  // Same machine: the pid decides (a recent lock from a dead process is stale).
  // Other machine: only age can tell.
  async function isFresh(l: LockInfo): Promise<boolean> {
    if (l.machine === env.machine()) return env.processAlive(l.pid)
    return env.now() - l.timestamp < LOCK_STALE_MS
  }

  const refresh = async (): Promise<boolean> => {
    const existing = await readLock()
    if (existing !== null && existing !== 'invalid' && !mine(existing)) return false
    await write()
    return true
  }

  return {
    async acquire() {
      const existing = await readLock()
      let tookOverStale = false
      if (existing !== null) {
        if (existing !== 'invalid' && !mine(existing)) {
          if (await isFresh(existing)) return { status: 'held-elsewhere', holder: existing }
        }
        tookOverStale = existing === 'invalid' || !mine(existing)
      }
      await write()
      return { status: 'acquired', tookOverStale }
    },

    refresh,

    async release() {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
      const existing = await readLock()
      if (existing !== null && existing !== 'invalid' && mine(existing)) await io.remove(LOCK_PATH)
    },

    startAutoRefresh(onLost) {
      if (timer !== undefined) return
      timer = setInterval(() => {
        void refresh().then(
          (ok) => {
            if (!ok) onLost?.()
          },
          () => {}, // transient I/O failure: try again next tick
        )
      }, LOCK_REFRESH_MS)
    },
  }
}
