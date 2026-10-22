// M1 contract: types only. Tests and implementation both code against this file.
// Paths are relative to the project root, '/' separated.

export interface ProjectIO {
  /** null when the file does not exist */
  readText(path: string): Promise<string | null>
  /** temp file + rename; never leaves a half-written target */
  writeTextAtomic(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** all files under dir, recursively, as root-relative paths */
  listFiles(dir: string): Promise<string[]>
  mkdir(dir: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  /** copies a directory tree (used for pre-migration backups) */
  copyTree(from: string, to: string): Promise<void>
  stat(path: string): Promise<{ mtimeMs: number } | null>
  /** root-relative paths that changed; returns an unsubscribe fn */
  watch(onChange: (paths: string[]) => void): Promise<() => void>
}

export interface FileError {
  file: string
  /** dotted path of the first failing field, when known */
  field?: string
  message: string
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: FileError }

export type ReadOnlyReason = 'newer-version' | 'unknown-kind' | 'locked-elsewhere'

export type Issue =
  | { kind: 'missing'; itemId: string; path: string }
  | { kind: 'invalid'; itemId: string; path: string; error: FileError }
  | { kind: 'unlisted'; path: string }

export interface TrashEntry {
  id: string
  type: 'part' | 'chapter' | 'scene'
  title: string
  originalPath: string
  trashPath: string
  parentId: string | null
  index: number
  deletedAt: string
}

export type OpenResult =
  | { status: 'refused'; error: FileError; reason: 'invalid-json' | 'invalid-schema' }
  | { status: 'migration-failed'; error: string }
  | { status: 'ok'; project: OpenProject; issues: Issue[] }

/** Injectable environment so tests are deterministic. */
export interface Env {
  now(): number
  newId(): string
}

export type ReloadResult =
  | { status: 'ok' }
  | { status: 'missing' }
  | { status: 'invalid'; error: FileError }

export interface OpenProject {
  manifest: import('./schemas/manifest').Manifest
  readOnly: { reason: ReadOnlyReason } | null
  io: ProjectIO
  /** validates, serializes, skips when content hash is unchanged, writes atomically; refuses when readOnly or file invalid */
  saveItem<T>(path: string, schema: import('zod').ZodType<T>, value: T): Promise<void>
  saveManifest(): Promise<void>
  /** last hash we know to be on disk, per path */
  knownHash(path: string): string | undefined
  /** root-relative paths of items marked invalid on open (never overwritten) */
  isInvalid(path: string): boolean
  /** Re-reads the file from disk: updates the known hash and the invalid flag. Does not return the content. */
  reloadItem(path: string): Promise<ReloadResult>
  deleteItem(id: string): Promise<TrashEntry>
  restoreItem(id: string): Promise<void>
}

export interface LockInfo {
  machine: string
  pid: number
  /** ms epoch */
  timestamp: number
}

export type LockResult =
  | { status: 'acquired'; tookOverStale: boolean }
  | { status: 'held-elsewhere'; holder: LockInfo }

export interface LockEnv {
  now(): number
  machine(): string
  pid(): number
  processAlive(pid: number): Promise<boolean>
}

export type ChangeEvent =
  | { kind: 'reloaded'; path: string }
  | { kind: 'prompt'; path: string; choices: ['reload', 'keep'] }
  | { kind: 'deleted'; path: string }
  | { kind: 'manifest-changed' }
