export type DictScope = 'local' | 'global'

/** A dictionary as the book manifest refers to it. */
export interface DictRef {
  name: string
  scope: DictScope
}

/** Plain, serialisable dictionary content (safe to post to a worker). */
export type LoadedDictionary =
  { kind: 'hunspell'; aff: string; dic: string } | { kind: 'wordlist'; words: string[] }

export type DictionaryErrorCode =
  | 'invalid-name'
  | 'bad-dic'
  | 'bad-aff'
  | 'unsupported-encoding'
  | 'empty-wordlist'
  | 'exists'
  | 'not-found'
  | 'read-only'
  | 'no-local'
  | 'same-scope'

export class DictionaryError extends Error {
  constructor(
    readonly code: DictionaryErrorCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'DictionaryError'
  }
}

/** The part of ProjectIO the dictionary code needs (ProjectIO satisfies it). */
export interface DictStorage {
  readText(path: string): Promise<string | null>
  writeTextAtomic(path: string, text: string): Promise<void>
  /** all files under dir, recursively */
  listFiles(dir: string): Promise<string[]>
  remove(path: string): Promise<void>
}
