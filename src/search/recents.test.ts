import { beforeEach, describe, expect, it } from 'vitest'
import { loadRecents as load, saveRecents as save, type KeyValueStore } from './recents'

const mem = new Map<string, string>()
const store: KeyValueStore = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, v),
}
const loadRecents = (root: string) => load(root, store)
const saveRecents = (root: string, ids: string[]) => save(root, ids, store)

describe('recents storage', () => {
  beforeEach(() => mem.clear())

  it('round-trips per book', () => {
    saveRecents('/a', ['x', 'y'])
    saveRecents('/b', ['z'])
    expect(loadRecents('/a')).toEqual(['x', 'y'])
    expect(loadRecents('/b')).toEqual(['z'])
  })

  it('ignores a damaged value', () => {
    store.setItem('storyworks.recents:/a', '{"nope":1}')
    expect(loadRecents('/a')).toEqual([])
    store.setItem('storyworks.recents:/a', 'not json')
    expect(loadRecents('/a')).toEqual([])
  })

  it('keeps at most ten', () => {
    saveRecents('/a', Array.from({ length: 15 }, (_, i) => String(i)))
    expect(loadRecents('/a')).toHaveLength(10)
  })
})
