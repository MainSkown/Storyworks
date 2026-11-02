import { invoke } from '@tauri-apps/api/core'
import { HistoryError, type CommitInput, type FileChange, type HistoryEngine, type SnapshotInfo } from './engine'

interface RustError {
  code: 'corrupt' | 'nothing-to-commit' | 'not-found' | 'io'
  message: string
}

const isRustError = (e: unknown): e is RustError =>
  typeof e === 'object' && e !== null && 'code' in e && 'message' in e

/** Rejections from the Rust commands become HistoryError; `not-found` is handled by callers. */
function toHistoryError(e: unknown): unknown {
  if (!isRustError(e)) return e
  if (e.code === 'nothing-to-commit') return new HistoryError('nothing-to-commit', e.message)
  return new HistoryError('corrupt', e.message)
}

async function call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (e) {
    throw toHistoryError(e)
  }
}

/** Git-backed history (libgit2 in Rust) for the project folder at absolute path `rootDir`. */
export function createTauriEngine(rootDir: string): HistoryEngine {
  const root = rootDir
  return {
    check: () => call<void>('history_check', { root }),
    status: (scope) => call<FileChange[]>('history_status', { root, scope }),
    commit: (input: CommitInput) =>
      call<string>('history_commit', {
        root,
        message: input.message,
        include: input.include,
        overrides: Object.entries(input.overrides).map(([path, bytes]) => ({ path, bytes: Array.from(bytes) })),
      }),
    log: () => call<SnapshotInfo[]>('history_log', { root }),
    changedFiles: (id) => call<FileChange[]>('history_changed_files', { root, id }),
    listTree: (id) => call<string[]>('history_tree', { root, id }),
    async readFile(id, path) {
      try {
        return new Uint8Array(await invoke<ArrayBuffer>('history_read', { root, id, path }))
      } catch (e) {
        if (isRustError(e) && e.code === 'not-found') return null
        throw toHistoryError(e)
      }
    },
  }
}
