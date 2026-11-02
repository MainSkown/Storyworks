import type { ProjectIO, Env } from '../project/types'
import { HistoryError, type CommitInput, type FileChange, type HistoryEngine, type SnapshotInfo } from './engine'

export interface MemoryEngine extends HistoryEngine {
  /** Test hook: makes the history unreadable. */
  breakIt(): void
}

interface Commit extends SnapshotInfo {
  files: Map<string, Uint8Array>
}

const enc = new TextEncoder()
// The memory and browser stores keep every file as text (binary files as base64), so read text, not bytes.
const readFile = async (io: ProjectIO, path: string) => {
  const text = await io.readText(path)
  return text === null ? null : enc.encode(text)
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])

function diff(from: Map<string, Uint8Array>, to: Map<string, Uint8Array>): FileChange[] {
  const out: FileChange[] = []
  for (const [path, bytes] of to) {
    const old = from.get(path)
    if (!old) out.push({ path, status: 'added' })
    else if (!same(old, bytes)) out.push({ path, status: 'modified' })
  }
  for (const path of from.keys()) if (!to.has(path)) out.push({ path, status: 'deleted' })
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/** In-memory history for the browser build and tests; same contract as the git-backed engine. */
export function createMemoryEngine(io: ProjectIO, env: Env): MemoryEngine {
  const commits: Commit[] = [] // oldest first
  let broken = false
  const guard = () => {
    if (broken) throw new HistoryError('corrupt', 'The history cannot be read.')
  }
  const byId = (id: string) => {
    guard()
    const c = commits.find((x) => x.id === id)
    if (!c) throw new HistoryError('corrupt', `Unknown snapshot ${id}`)
    return c
  }
  const parentFiles = (id: string) => {
    const i = commits.findIndex((x) => x.id === id)
    return i > 0 ? commits[i - 1].files : new Map<string, Uint8Array>()
  }

  return {
    breakIt() {
      broken = true
    },
    async check() {
      guard()
    },
    async status(scope) {
      guard()
      const head = commits.at(-1)?.files ?? new Map<string, Uint8Array>()
      const now = new Map<string, Uint8Array>()
      for (const path of new Set([...scope, ...head.keys()])) {
        const bytes = await readFile(io, path)
        if (bytes) now.set(path, bytes)
      }
      return diff(head, now)
    },
    async commit(input: CommitInput) {
      guard()
      const files = new Map(commits.at(-1)?.files ?? [])
      for (const path of input.include) {
        const bytes = await readFile(io, path)
        if (bytes) files.set(path, bytes)
        else files.delete(path)
      }
      for (const [path, bytes] of Object.entries(input.overrides)) files.set(path, bytes)
      if (commits.length > 0 && diff(commits.at(-1)!.files, files).length === 0) {
        throw new HistoryError('nothing-to-commit', 'Nothing to snapshot.')
      }
      const id = env.newId()
      commits.push({ id, message: input.message, time: new Date(env.now()).toISOString(), files })
      return id
    },
    async log() {
      guard()
      return [...commits].reverse().map(({ id, message, time }) => ({ id, message, time }))
    },
    async changedFiles(id) {
      return diff(parentFiles(byId(id).id), byId(id).files)
    },
    async listTree(id) {
      return [...byId(id).files.keys()].sort()
    },
    async readFile(id, path) {
      return byId(id).files.get(path) ?? null
    },
  }
}
