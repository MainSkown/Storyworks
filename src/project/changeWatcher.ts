import { sha256Hex } from './hash'
import type { ChangeEvent, OpenProject, ProjectIO } from './types'

const MANIFEST_PATH = 'project.json'
const INTERNAL_PREFIX = '.storyworks/'

export interface ChangeWatcherOptions {
  io: ProjectIO
  project: Pick<OpenProject, 'knownHash' | 'manifest'>
  /** true when the item has unsaved in-app edits */
  isDirty(path: string): boolean
  /** re-reads the file into the app and updates its known hash */
  reload(path: string): Promise<void>
  onEvent(event: ChangeEvent): void
  onError?(error: unknown): void
}

export interface ChangeWatcher {
  /** Re-checks the given paths against their known hashes. Calls are run one after another. */
  handle(paths: string[]): Promise<void>
  /** Re-checks every known file (window focus; watchers miss events on some folders). */
  recheck(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

/** Every `path` string in the manifest (item refs and manuscript nodes), plus the manifest itself. */
function knownCandidates(manifest: unknown): string[] {
  const found = new Set<string>([MANIFEST_PATH])
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) {
        if (key === 'path' && typeof v === 'string') found.add(v)
        else walk(v)
      }
    }
  }
  walk(manifest)
  return [...found]
}

/**
 * Hash-based: any watch event only means "look at this path again". Whether the
 * app wrote it is decided by comparing the file's hash with the last known one.
 */
export function createChangeWatcher(opts: ChangeWatcherOptions): ChangeWatcher {
  const { io, project, isDirty, reload, onEvent } = opts
  // Disk state (hash, or null = deleted) last reported per path, so a file that stays
  // different (user chose "keep", or still deleted) is not reported again on every focus.
  const reported = new Map<string, string | null>()
  let queue: Promise<void> = Promise.resolve()
  let unsubscribe: (() => void) | undefined

  async function check(path: string): Promise<void> {
    if (path.startsWith(INTERNAL_PREFIX) || path === '.storyworks') return
    if (project.knownHash(path) === undefined) return

    const text = await io.readText(path)
    const diskHash = text === null ? null : await sha256Hex(text)
    // Read after the file read and hash: an own save may finish while we were reading.
    const known = project.knownHash(path)
    if (known === undefined || diskHash === known) {
      reported.delete(path)
      return
    }
    if (reported.has(path) && reported.get(path) === diskHash) return

    if (path === MANIFEST_PATH && diskHash !== null) {
      reported.set(path, diskHash)
      onEvent({ kind: 'manifest-changed' })
    } else if (diskHash === null) {
      reported.set(path, null)
      onEvent({ kind: 'deleted', path })
    } else if (isDirty(path)) {
      reported.set(path, diskHash)
      onEvent({ kind: 'prompt', path, choices: ['reload', 'keep'] })
    } else {
      await reload(path)
      reported.delete(path)
      onEvent({ kind: 'reloaded', path })
    }
  }

  function handle(paths: string[]): Promise<void> {
    const run = async () => {
      for (const path of new Set(paths)) {
        try {
          await check(path)
        } catch (e) {
          ;(opts.onError ?? console.error)(e)
        }
      }
    }
    const result = queue.then(run)
    queue = result
    return result
  }

  return {
    handle,
    recheck: () =>
      handle(knownCandidates(project.manifest).filter((p) => project.knownHash(p) !== undefined)),
    async start() {
      if (unsubscribe) return
      unsubscribe = await io.watch((paths) => {
        void handle(paths)
      })
    },
    async stop() {
      unsubscribe?.()
      unsubscribe = undefined
    },
  }
}
