import { describe, expect, it } from 'vitest'
import { createIndex } from './index'

const scene = (id: string, title: string, parts?: string[]) => ({
  id,
  kind: 'scene' as const,
  title,
  parts: parts?.map((text, i) => ({ text, blockId: `${id}-b${i}` })),
})

describe('index', () => {
  it('upsert adds an item and upsert again replaces it in place', () => {
    const ix = createIndex()
    ix.upsert('manuscript', scene('a', 'A'))
    ix.upsert('manuscript', scene('b', 'B'))
    ix.upsert('manuscript', scene('a', 'A2'))
    expect(ix.items('manuscript').map((i) => i.id + i.title)).toEqual(['aA2', 'bB'])
  })

  it('remove drops the item', () => {
    const ix = createIndex()
    ix.upsert('manuscript', scene('a', 'A'))
    ix.remove('a')
    expect(ix.has('a')).toBe(false)
  })

  it('removing a container removes its children, at any depth', () => {
    const ix = createIndex()
    ix.upsert('manuscript', { id: 'p', kind: 'chapter', title: 'P' })
    ix.upsert('manuscript', { id: 'c', kind: 'chapter', title: 'C', parentId: 'p' })
    ix.upsert('manuscript', { ...scene('s', 'S'), parentId: 'c' })
    ix.remove('p')
    expect(ix.has('c') || ix.has('s')).toBe(false)
  })

  it('upsert without parts keeps the loaded body; with parts replaces it', () => {
    const ix = createIndex()
    ix.upsert('manuscript', scene('a', 'A', ['one']))
    ix.upsert('manuscript', scene('a', 'Renamed'))
    expect(ix.get('a')?.parts?.map((p) => p.text)).toEqual(['one'])
    ix.upsert('manuscript', scene('a', 'Renamed', ['two']))
    expect(ix.get('a')?.parts?.map((p) => p.text)).toEqual(['two'])
  })

  it('lists scenes whose body is not loaded yet', () => {
    const ix = createIndex()
    ix.upsert('manuscript', scene('a', 'A'))
    ix.upsert('manuscript', scene('b', 'B', ['x']))
    expect(ix.pendingBodies()).toEqual(['a'])
  })

  it('reorder puts listed ids first, in that order', () => {
    const ix = createIndex()
    for (const id of ['a', 'b', 'c']) ix.upsert('manuscript', scene(id, id))
    ix.reorder('manuscript', ['c', 'a'])
    expect(ix.items('manuscript').map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('moves an item to the new area when it is upserted into another', () => {
    const ix = createIndex()
    ix.upsert('rules', { id: 'x', kind: 'rule', title: 'X' })
    ix.upsert('codex', { id: 'x', kind: 'entry', title: 'X' })
    expect(ix.items('rules')).toHaveLength(0)
    expect(ix.items('codex')).toHaveLength(1)
  })
})
