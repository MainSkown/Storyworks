import { describe, expect, it } from 'vitest'
import { gameItems, linkContext } from './items'
import { resolveLink } from '../game/crossLinks'

const node = (id: string, type: 'scene' | 'conversation' | 'chapter', title: string, children: unknown[] = []) =>
  ({ id, type, title, children }) as never
const trashed = (id: string, type: 'scene' | 'conversation' | 'chapter', title: string) =>
  ({ id, type, title, originalPath: '', trashPath: '', parentId: null, index: 0, deletedAt: '' }) as never

const manifest = {
  manuscript: [
    node('f1', 'chapter', 'Act 1', [
      node('c1', 'conversation', 'Greeting'),
      node('f2', 'chapter', 'Village', [node('s1', 'scene', 'Intro')]),
    ]),
    node('c2', 'conversation', 'Bar'),
  ],
  trash: [trashed('c3', 'conversation', 'Old talk'), trashed('f9', 'chapter', 'Old folder')],
}

describe('gameItems', () => {
  it('lists scripts and conversations in tree order with their folder path, then trashed ones', () => {
    expect(gameItems(manifest).map((i) => [i.id, i.type, i.folder, i.trashed])).toEqual([
      ['c1', 'conversation', ['Act 1'], false],
      ['s1', 'scene', ['Act 1', 'Village'], false],
      ['c2', 'conversation', [], false],
      ['c3', 'conversation', [], true],
    ])
  })
})

describe('linkContext', () => {
  const ctx = linkContext(gameItems(manifest), (id) => (id === 'c1' ? new Set(['n1']) : null))

  it('knows live, trashed and unknown items', () => {
    expect(ctx.item('c1')).toEqual({ type: 'conversation', trashed: false })
    expect(ctx.item('c3')).toEqual({ type: 'conversation', trashed: true })
    expect(ctx.item('f1')).toBeNull()
    expect(ctx.item('nope')).toBeNull()
  })

  it('works with resolveLink: trashed is broken, a node of a loaded conversation is checked', () => {
    expect(resolveLink({ itemId: 'c3' }, ctx)).toEqual({ ok: false, reason: 'item-trashed' })
    expect(resolveLink({ itemId: 'c1', nodeId: 'n1' }, ctx)).toEqual({ ok: true })
    expect(resolveLink({ itemId: 'c1', nodeId: 'zz' }, ctx)).toEqual({ ok: false, reason: 'node-missing' })
    expect(resolveLink({ itemId: 'c2', nodeId: 'zz' }, ctx)).toEqual({ ok: true })
  })
})
