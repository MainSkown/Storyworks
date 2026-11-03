import type { Area, IndexInput, SearchIndex } from './index'

/** One index item, with the inputs it is built from. The item is rebuilt only when `deps` change. */
export interface Unit {
  id: string
  deps: readonly unknown[]
  make: () => IndexInput
}

const same = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((x, i) => Object.is(x, b[i]))

/**
 * Keeps one area of the index equal to a list of units (in document order). Cheap to call after
 * every store change: unchanged units are skipped, vanished ones removed, order fixed when it moved.
 */
export function createAreaSync(index: SearchIndex, area: Area) {
  let prev = new Map<string, readonly unknown[]>()
  let order = ''
  return {
    sync(units: readonly Unit[]): void {
      const next = new Map<string, readonly unknown[]>()
      // Upserts first: a moved item must leave its old parent before that parent is removed.
      for (const u of units) {
        next.set(u.id, u.deps)
        const old = prev.get(u.id)
        if (!old || !same(old, u.deps) || !index.has(u.id)) index.upsert(area, u.make())
      }
      for (const id of prev.keys()) if (!next.has(id)) index.remove(id)
      const ids = units.map((u) => u.id)
      const key = ids.join('\n')
      if (key !== order) {
        index.reorder(area, ids)
        order = key
      }
      prev = next
    },
    reset(): void {
      prev = new Map()
      order = ''
    },
  }
}
