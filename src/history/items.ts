// Turns file changes + two manifests into the plain-word items shown in Changes and History.
import type { FileChange } from './engine'
import type { Entry, ItemType, ManifestView } from './manifestView'

export type ChangeKind = 'added' | 'deleted' | 'modified' | 'renamed' | 'moved'
const KIND_ORDER: ChangeKind[] = ['added', 'deleted', 'modified', 'renamed', 'moved']

export interface ChangeItem {
  /** Stable across recomputation: "node:<id>", "rule:<id>", "calendar", "file:<path>", "settings". */
  key: string
  type: ItemType
  title: string
  kinds: ChangeKind[]
  /** Ancestor titles for manuscript items ("Chapter 3" for a scene). */
  context: string[]
  /** Files that change with this item (committed when it is included). */
  paths: string[]
}

/** Indexes of `a` and `b` entries that are not part of a longest common subsequence of ids. */
function outOfOrder(a: string[], b: string[]): Set<string> {
  const n = a.length
  const m = b.length
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  const kept = new Set<string>()
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { kept.add(a[i]); i++; j++ }
    else if (t[i + 1][j] >= t[i][j + 1]) i++
    else j++
  }
  return new Set(b.filter((id) => !kept.has(id)))
}

const siblings = (view: ManifestView | null, parent: string) =>
  view ? view.entries.filter((e) => e.parent === parent).map((e) => e.key) : []

export function buildChangeItems(
  oldView: ManifestView | null,
  newView: ManifestView,
  files: FileChange[],
): ChangeItem[] {
  const status = new Map(files.map((f) => [f.path, f.status]))
  const oldMap = new Map((oldView?.entries ?? []).map((e) => [e.key, e]))
  const newMap = new Map(newView.entries.map((e) => [e.key, e]))
  const owned = new Set<string>()
  const items: ChangeItem[] = []

  // Move detection: within one container, entries outside the longest common order.
  const moved = new Set<string>()
  if (oldView) {
    const parents = new Set(newView.entries.map((e) => e.parent))
    for (const parent of parents) {
      const inOld = new Set(siblings(oldView, parent))
      const inNew = new Set(siblings(newView, parent))
      const a = siblings(oldView, parent).filter((k) => inNew.has(k))
      const b = siblings(newView, parent).filter((k) => inOld.has(k))
      for (const k of outOfOrder(a, b)) moved.add(k)
    }
  }

  const describe = (key: string, now: Entry | undefined, was: Entry | undefined) => {
    const e = (now ?? was)!
    const kinds = new Set<ChangeKind>()
    if (!was) kinds.add('added')
    else if (!now) kinds.add('deleted')
    else {
      if (was.title !== now.title) kinds.add('renamed')
      if (was.parent !== now.parent || moved.has(key)) kinds.add('moved')
    }
    const paths = [...new Set([now?.path, was?.path])].filter((p): p is string => !!p && status.has(p))
    paths.forEach((p) => owned.add(p))
    if (kinds.size === 0 && paths.length > 0) kinds.add('modified')
    else if (kinds.size > 0 && !kinds.has('added') && !kinds.has('deleted') && paths.length > 0) kinds.add('modified')
    if (kinds.size === 0) return
    items.push({
      key, type: e.type, title: e.title, context: e.context, paths,
      kinds: KIND_ORDER.filter((k) => kinds.has(k)),
    })
  }

  for (const e of newView.entries) describe(e.key, e, oldMap.get(e.key))
  for (const e of oldView?.entries ?? []) if (!newMap.has(e.key)) describe(e.key, undefined, e)

  for (const f of files) {
    if (f.path === 'project.json' || owned.has(f.path)) continue
    const inDir = (d: string) => f.path.startsWith(`${d}/`)
    const type: ItemType = inDir(newView.dirs.assets) ? 'asset' : inDir(newView.dirs.dictionaries) ? 'dictionary' : 'file'
    items.push({ key: `file:${f.path}`, type, title: f.path.split('/').pop() ?? f.path, kinds: [f.status], context: [], paths: [f.path] })
  }

  if (!oldView) items.push({ key: 'settings', type: 'settings', title: '', kinds: ['added'], context: [], paths: [] })
  else if (oldView.settings !== newView.settings) {
    items.push({ key: 'settings', type: 'settings', title: '', kinds: ['modified'], context: [], paths: [] })
  }
  return items
}
