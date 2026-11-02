// Which items a partial snapshot must take together, and the project.json it records.
import type { ChangeItem } from './items'
import { SINGLETONS, STRUCTURAL_FIELDS, type ManifestView } from './manifestView'
import { findNode, insertAfterPredecessor, type Obj, type TreeNode } from './manifestTree'


export interface Plan {
  keys: string[]
  /** Keys added to the selection because the chosen items depend on them. */
  pulledIn: string[]
  /** True when the manifest could not be merged item by item and everything is taken. */
  forcedAll: boolean
  include: string[]
  /** Merged project.json to record; null = no override. */
  manifest: string | null
  /** Record the folder's project.json unchanged. */
  takeManifest: boolean
}

/** Adds ancestors that are new and descendants that leave a deleted container. */
function closure(items: ChangeItem[], keys: Set<string>, oldView: ManifestView, newView: ManifestView): string[] {
  const changed = new Map(items.map((i) => [i.key, i]))
  const newMap = new Map(newView.entries.map((e) => [e.key, e]))
  const pulled: string[] = []
  const take = (k: string) => {
    if (changed.has(k) && !keys.has(k)) { keys.add(k); pulled.push(k) }
  }
  for (let again = true; again; ) {
    const before = keys.size
    for (const k of [...keys]) {
      const now = newMap.get(k)
      if (now?.parent.startsWith('node:') && changed.get(now.parent)?.kinds.includes('added')) take(now.parent)
      const item = changed.get(k)
      if (item?.kinds.includes('deleted')) {
        for (const e of oldView.entries) if (e.parent === k) take(e.key)
      }
    }
    again = keys.size !== before
  }
  return pulled
}

const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : [])

function mergeManifest(oldView: ManifestView, newView: ManifestView, items: ChangeItem[], keys: Set<string>): Obj {
  const merged = structuredClone(oldView.raw) as Obj
  const newRaw = newView.raw
  const oldMap = new Map(oldView.entries.map((e) => [e.key, e]))
  const selected = items.filter((i) => keys.has(i.key))
  const deleted = selected.filter((i) => i.kinds.includes('deleted'))
  const upserts = newView.entries.filter((e) => selected.some((i) => i.key === e.key && !i.kinds.includes('deleted')))

  if (selected.some((i) => i.key === 'settings')) {
    for (const [k, v] of Object.entries(newRaw)) if (!STRUCTURAL_FIELDS.has(k)) merged[k] = structuredClone(v)
    for (const k of Object.keys(merged)) if (!STRUCTURAL_FIELDS.has(k) && !(k in newRaw)) delete merged[k]
  }

  const rawNewNodes = (id: string) => {
    const r = findNode(newRaw.manuscript as TreeNode[], id)
    return r ? r.list[r.index] : null
  }
  const mergedTree = (merged.manuscript ?? []) as TreeNode[]
  merged.manuscript = mergedTree

  for (const e of upserts) {
    const kinds = items.find((i) => i.key === e.key)!.kinds
    if (e.key.startsWith('node:')) {
      const src = rawNewNodes(e.id)
      if (!src) continue
      const existing = findNode(mergedTree, e.id)
      const keepInPlace = existing && !kinds.includes('moved') && !kinds.includes('added')
      if (keepInPlace) {
        const node = existing.list[existing.index]
        node.title = src.title as string
        if ('path' in src) node.path = src.path
        continue
      }
      const children = existing ? existing.list.splice(existing.index, 1)[0].children : []
      const node: TreeNode = { ...structuredClone(src), children } as TreeNode
      const parentId = e.parent.startsWith('node:') ? e.parent.slice(5) : null
      const parentRef = parentId ? findNode(mergedTree, parentId) : null
      const target = parentRef ? parentRef.list[parentRef.index].children : mergedTree
      const newSiblings = (parentId ? (rawNewNodes(parentId)?.children ?? []) : (newRaw.manuscript as TreeNode[])).map((c) => c.id)
      insertAfterPredecessor(target, node, newSiblings)
    } else if (e.key in SINGLETONS) {
      merged[e.key] = structuredClone(newRaw[e.key])
    } else {
      const area = e.parent.slice('area:'.length)
      const list = (merged[area] = arr(merged[area]) as Array<{ id: string } & Obj>)
      const src = arr(newRaw[area]).find((r) => r.id === e.id) as { id: string } & Obj
      const at = list.findIndex((r) => r.id === e.id)
      if (at >= 0 && !kinds.includes('moved')) list[at] = structuredClone(src)
      else {
        if (at >= 0) list.splice(at, 1)
        insertAfterPredecessor(list, structuredClone(src), arr(newRaw[area]).map((r) => r.id as string))
      }
    }
  }

  for (const i of deleted) {
    const e = oldMap.get(i.key)
    if (!e) continue
    if (e.key.startsWith('node:')) {
      const r = findNode(mergedTree, e.id)
      if (r) r.list.splice(r.index, 1)
    } else if (e.key in SINGLETONS) {
      merged[e.key] = null
    } else {
      const area = e.parent.slice('area:'.length)
      merged[area] = arr(merged[area]).filter((r) => r.id !== e.id)
    }
  }
  return merged
}

export function planSnapshot(args: {
  oldView: ManifestView | null
  newView: ManifestView
  items: ChangeItem[]
  /** 'all' or item keys */
  selected: string[] | 'all'
}): Plan {
  const { oldView, newView, items } = args
  const all = (forced: boolean): Plan => ({
    keys: items.map((i) => i.key),
    pulledIn: [],
    forcedAll: forced,
    include: [...new Set(items.flatMap((i) => i.paths))],
    manifest: null,
    takeManifest: true,
  })
  if (args.selected === 'all' || !oldView) return all(false)

  const keys = new Set(args.selected.filter((k) => items.some((i) => i.key === k)))
  if (oldView.version !== newView.version) {
    // A migrated manifest cannot be merged item by item: take everything.
    return keys.size === 0 ? { ...all(false), keys: [], include: [], takeManifest: false } : all(keys.size < items.length)
  }
  const pulledIn = closure(items, keys, oldView, newView)
  if (keys.size === items.length) return { ...all(false), pulledIn }

  const picked = items.filter((i) => keys.has(i.key))
  const include = [...new Set(picked.flatMap((i) => i.paths))]
  const merged = mergeManifest(oldView, newView, items, keys)
  const mergedText = JSON.stringify(merged, null, 2) + '\n'
  const changedManifest = JSON.stringify(merged) !== JSON.stringify(oldView.raw)
  return { keys: [...keys], pulledIn, forcedAll: false, include, manifest: changedManifest ? mergedText : null, takeManifest: false }
}
