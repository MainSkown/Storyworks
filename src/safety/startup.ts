import type { FileIO } from '../io/fileIO'
import { clearMarker, readMarker, writeMarker, type Marker } from './marker'

export interface SafetyEnv {
  now(): number
  pid(): number
  processAlive(pid: number): Promise<boolean>
}

export type StartupState =
  | { kind: 'clean' }
  | { kind: 'crashed'; lastBook: string | null }
  /** Another running copy of the app owns the marker; it is left alone. */
  | { kind: 'other-instance' }

export interface SafetySession {
  state: StartupState
  /** Remembers the book to offer after a crash. */
  setLastBook(path: string): Promise<void>
  /** Clean exit: removes our marker. */
  end(): Promise<void>
}

/** Decides what the previous run left behind, then writes our marker. */
export async function beginSession(io: FileIO, env: SafetyEnv): Promise<SafetySession> {
  const found = await readMarker(io)
  let state: StartupState = { kind: 'clean' }
  let lastBook: string | null = null
  if (found === 'invalid') {
    state = { kind: 'crashed', lastBook: null }
  } else if (found !== null && found.pid !== env.pid()) {
    if (await env.processAlive(found.pid)) state = { kind: 'other-instance' }
    else {
      lastBook = found.lastBook
      state = { kind: 'crashed', lastBook }
    }
  } else if (found !== null) {
    lastBook = found.lastBook // same process: a page reload
  }

  const owns = state.kind !== 'other-instance'
  const mine: Marker = { pid: env.pid(), startedAt: env.now(), lastBook }
  if (owns) await writeMarker(io, mine)
  return {
    state,
    async setLastBook(path) {
      if (!owns) return
      mine.lastBook = path
      await writeMarker(io, mine)
    },
    async end() {
      if (owns) await clearMarker(io)
    },
  }
}

const browserPid = Math.floor(Math.random() * 2 ** 31)

/** Real environment; in the browser build no other process can be told apart, so none counts as alive. */
export async function createSafetyEnv(): Promise<SafetyEnv> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return { now: () => Date.now(), pid: () => browserPid, processAlive: async () => false }
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const pid = await invoke<number>('process_id')
  return {
    now: () => Date.now(),
    pid: () => pid,
    processAlive: (p) => invoke<boolean>('process_alive', { pid: p }),
  }
}

