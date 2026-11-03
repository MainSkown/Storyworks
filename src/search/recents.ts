import { RECENTS_MAX } from './switcher'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

// Recents are per book and per machine: kept in localStorage under the book's folder,
// not in app settings (whose schema has no per-book slot) and not in the book itself.
const key = (root: string) => `storyworks.recents:${root}`

const defaultStore = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadRecents(root: string, store: KeyValueStore | null = defaultStore()): string[] {
  try {
    const v: unknown = JSON.parse(store?.getItem(key(root)) ?? '[]')
    if (!Array.isArray(v)) return []
    return v.filter((x): x is string => typeof x === 'string').slice(0, RECENTS_MAX)
  } catch {
    return []
  }
}

export function saveRecents(
  root: string,
  ids: readonly string[],
  store: KeyValueStore | null = defaultStore(),
): void {
  try {
    store?.setItem(key(root), JSON.stringify(ids.slice(0, RECENTS_MAX)))
  } catch {
    // storage unavailable: recents just aren't remembered
  }
}
