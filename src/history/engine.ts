// M9 contract: thin plumbing over git. All item/partial/restore logic lives above it in TypeScript.
// Paths are project-root-relative, '/' separated.

export interface FileChange {
  path: string
  status: 'added' | 'modified' | 'deleted'
}

export interface SnapshotInfo {
  id: string
  message: string
  /** ISO timestamp */
  time: string
}

export interface CommitInput {
  message: string
  /** Files taken from the project folder; a path that no longer exists is recorded as deleted. */
  include: string[]
  /** Files recorded with exactly these bytes instead of the folder's (e.g. a merged project.json). */
  overrides: Record<string, Uint8Array>
}

export type HistoryErrorCode = 'corrupt' | 'nothing-to-commit' | 'manifest' | 'read-only'

export class HistoryError extends Error {
  readonly code: HistoryErrorCode
  constructor(code: HistoryErrorCode, message: string) {
    super(message)
    this.name = 'HistoryError'
    this.code = code
  }
}

export interface HistoryEngine {
  /**
   * Working folder vs the newest snapshot, over `scope` plus every path in that snapshot.
   * With no snapshot yet, every existing scope file is `added`. Never creates anything.
   */
  status(scope: string[]): Promise<FileChange[]>
  /** Creates the history on first use. Throws `nothing-to-commit` when the new tree equals the last. */
  commit(input: CommitInput): Promise<string>
  /** Newest first. */
  log(): Promise<SnapshotInfo[]>
  /** Files that differ between snapshot `id` and its parent (empty tree for the first snapshot). */
  changedFiles(id: string): Promise<FileChange[]>
  /** Every file recorded in snapshot `id`. */
  listTree(id: string): Promise<string[]>
  readFile(id: string, path: string): Promise<Uint8Array | null>
  /** Throws `corrupt` when the history exists but cannot be read; a missing history is fine. */
  check(): Promise<void>
}
