export type SaveStatus = 'saved' | 'saving' | 'error'

export interface AutosaverOptions {
  save: (path: string) => Promise<void>
  delayMs?: number
}

export interface Autosaver {
  /** Schedules a save of `path` after the debounce delay. */
  markDirty(path: string): void
  /** True from the first edit until a save covering it has finished. */
  isDirty(path: string): boolean
  /** Saves everything dirty now and waits for saves in flight. */
  flushAll(): Promise<void>
  readonly status: SaveStatus
  /** Cancels pending timers; does not save. */
  dispose(): void
}

interface Entry {
  timer: ReturnType<typeof setTimeout> | null
  /** Bumped on every edit; compared with `saved` to tell dirty from clean. */
  version: number
  saved: number
  /** Chain that keeps writes for one path serial. */
  writing: Promise<void>
}

export function createAutosaver({ save, delayMs = 800 }: AutosaverOptions): Autosaver {
  const entries = new Map<string, Entry>()
  const failed = new Set<string>()
  let inFlight = 0

  function entry(path: string): Entry {
    let e = entries.get(path)
    if (!e) {
      e = { timer: null, version: 0, saved: 0, writing: Promise.resolve() }
      entries.set(path, e)
    }
    return e
  }

  function flush(path: string, e: Entry): Promise<void> {
    if (e.timer) {
      clearTimeout(e.timer)
      e.timer = null
    }
    if (e.version === e.saved) return e.writing
    e.writing = e.writing.then(async () => {
      const version = e.version
      if (version === e.saved) return
      inFlight++
      try {
        await save(path)
        e.saved = version
        failed.delete(path)
      } catch {
        failed.add(path)
      } finally {
        inFlight--
      }
    })
    return e.writing
  }

  return {
    markDirty(path) {
      const e = entry(path)
      e.version++
      if (e.timer) clearTimeout(e.timer)
      e.timer = setTimeout(() => void flush(path, e), delayMs)
    },
    isDirty: (path) => {
      const e = entries.get(path)
      return e !== undefined && e.version > e.saved
    },
    async flushAll() {
      await Promise.all([...entries].map(([path, e]) => flush(path, e)))
    },
    get status() {
      return inFlight > 0 ? 'saving' : failed.size > 0 ? 'error' : 'saved'
    },
    dispose() {
      for (const e of entries.values()) {
        if (e.timer) clearTimeout(e.timer)
        e.timer = null
      }
    },
  }
}
