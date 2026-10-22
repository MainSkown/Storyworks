import { describe, expect, it, vi } from 'vitest'
import { createLinkIndex, type Link } from './links'

const link = (id: string, from: Link['from'], to: Link['to'], kind = 'timeline'): Link => ({
  id,
  from,
  to,
  kind,
})

function setup(blockExists?: (item: string, block: string) => boolean) {
  const live = new Set(['scene1', 'scene2', 'node1', 'node2'])
  const index = createLinkIndex({ isLive: (id) => live.has(id), blockExists })
  return { index, live }
}

describe('link index: registry', () => {
  it('stores links per owner', () => {
    const { index } = setup()
    const l = link('l1', { item: 'scene1', block: 'b1' }, { item: 'node1' })
    index.setLinks('scene1', [l])
    expect(index.linksFrom('scene1')).toEqual([l])
    expect(index.linksFrom('scene2')).toEqual([])
  })

  it('setLinks replaces that owner links only', () => {
    const { index } = setup()
    const a = link('l1', { item: 'scene1' }, { item: 'node1' })
    const b = link('l2', { item: 'scene1' }, { item: 'node2' })
    const other = link('l3', { item: 'scene2' }, { item: 'node1' })
    index.setLinks('scene1', [a])
    index.setLinks('scene2', [other])
    index.setLinks('scene1', [b])
    expect(index.linksFrom('scene1')).toEqual([b])
    expect(index.linksFrom('scene2')).toEqual([other])
  })

  it('setLinks with an empty list clears the owner', () => {
    const { index } = setup()
    index.setLinks('scene1', [link('l1', { item: 'scene1' }, { item: 'node1' })])
    index.setLinks('scene1', [])
    expect(index.linksFrom('scene1')).toEqual([])
  })

  it('removeOwner drops that owner links from every query', () => {
    const { index } = setup()
    index.setLinks('scene1', [link('l1', { item: 'scene1' }, { item: 'node1' })])
    index.removeOwner('scene1')
    expect(index.linksFrom('scene1')).toEqual([])
    expect(index.linksTo({ item: 'node1' })).toEqual([])
  })

  it('removeOwner on an unknown owner does nothing', () => {
    const { index } = setup()
    expect(() => index.removeOwner('nope')).not.toThrow()
  })
})

describe('link index: linksTo', () => {
  it('finds links by target item across owners', () => {
    const { index } = setup()
    const a = link('l1', { item: 'scene1' }, { item: 'node1' })
    const b = link('l2', { item: 'scene2' }, { item: 'node1', block: 'x' })
    const c = link('l3', { item: 'scene2' }, { item: 'node2' })
    index.setLinks('scene1', [a])
    index.setLinks('scene2', [b, c])
    expect(index.linksTo({ item: 'node1' })).toEqual([a, b])
  })

  it('with a block, matches only links to that block', () => {
    const { index } = setup()
    const a = link('l1', { item: 'node1' }, { item: 'scene1', block: 'b1' })
    const b = link('l2', { item: 'node1' }, { item: 'scene1', block: 'b2' })
    const c = link('l3', { item: 'node1' }, { item: 'scene1' })
    index.setLinks('node1', [a, b, c])
    expect(index.linksTo({ item: 'scene1', block: 'b1' })).toEqual([a])
  })

  it('without a block, includes block-level links to the item', () => {
    const { index } = setup()
    const a = link('l1', { item: 'node1' }, { item: 'scene1', block: 'b1' })
    const b = link('l2', { item: 'node1' }, { item: 'scene1' })
    index.setLinks('node1', [a, b])
    expect(index.linksTo({ item: 'scene1' })).toEqual([a, b])
  })

  it('does not match a block id from another item', () => {
    const { index } = setup()
    index.setLinks('node1', [link('l1', { item: 'node1' }, { item: 'scene1', block: 'b1' })])
    expect(index.linksTo({ item: 'scene2', block: 'b1' })).toEqual([])
  })

  it('forgets links to a target after the owner replaces them', () => {
    const { index } = setup()
    index.setLinks('scene1', [link('l1', { item: 'scene1' }, { item: 'node1' })])
    index.setLinks('scene1', [])
    expect(index.linksTo({ item: 'node1' })).toEqual([])
  })
})

describe('link index: broken links', () => {
  it('a link to a live item is not broken', () => {
    const { index } = setup()
    const l = link('l1', { item: 'scene1' }, { item: 'node1' })
    index.setLinks('scene1', [l])
    expect(index.isBroken(l)).toBe(false)
    expect(index.brokenLinks()).toEqual([])
  })

  it('a link to an item that is not live is broken', () => {
    const { index } = setup()
    const l = link('l1', { item: 'scene1' }, { item: 'gone' })
    index.setLinks('scene1', [l])
    expect(index.isBroken(l)).toBe(true)
    expect(index.brokenLinks()).toEqual([l])
  })

  it('links are not deleted when the target is deleted, and un-break on restore', () => {
    const { index, live } = setup()
    const l = link('l1', { item: 'scene1' }, { item: 'node1' })
    index.setLinks('scene1', [l])
    live.delete('node1')
    expect(index.isBroken(l)).toBe(true)
    expect(index.linksTo({ item: 'node1' })).toEqual([l])
    live.add('node1')
    expect(index.isBroken(l)).toBe(false)
    expect(index.brokenLinks()).toEqual([])
  })

  it('deleting the item that owns links does not remove links that point to it', () => {
    const { index, live } = setup()
    const toScene = link('l1', { item: 'node1' }, { item: 'scene1', block: 'b1' })
    const fromScene = link('l2', { item: 'scene1', block: 'b1' }, { item: 'node1' })
    index.setLinks('node1', [toScene])
    index.setLinks('scene1', [fromScene])
    live.delete('scene1')
    expect(index.linksTo({ item: 'scene1', block: 'b1' })).toEqual([toScene])
    expect(index.brokenLinks()).toEqual([toScene])
  })

  it('block hook returning false makes the link broken', () => {
    const { index } = setup(() => false)
    const l = link('l1', { item: 'node1' }, { item: 'scene1', block: 'b1' })
    index.setLinks('node1', [l])
    expect(index.isBroken(l)).toBe(true)
  })

  it('block hook returning true keeps the link intact', () => {
    const { index } = setup((item, block) => item === 'scene1' && block === 'b1')
    const ok = link('l1', { item: 'node1' }, { item: 'scene1', block: 'b1' })
    const bad = link('l2', { item: 'node1' }, { item: 'scene1', block: 'b2' })
    index.setLinks('node1', [ok, bad])
    expect(index.brokenLinks()).toEqual([bad])
  })

  it('without a block hook only the item is checked', () => {
    const { index } = setup()
    const l = link('l1', { item: 'node1' }, { item: 'scene1', block: 'never-existed' })
    index.setLinks('node1', [l])
    expect(index.isBroken(l)).toBe(false)
  })

  it('block hook is not asked about item-level links', () => {
    const hook = vi.fn(() => false)
    const { index } = setup(hook)
    const l = link('l1', { item: 'node1' }, { item: 'scene1' })
    index.setLinks('node1', [l])
    expect(index.isBroken(l)).toBe(false)
    expect(hook).not.toHaveBeenCalled()
  })

  it('a not-live target is broken without asking the block hook', () => {
    const hook = vi.fn(() => true)
    const { index } = setup(hook)
    const l = link('l1', { item: 'node1' }, { item: 'gone', block: 'b1' })
    index.setLinks('node1', [l])
    expect(index.isBroken(l)).toBe(true)
  })
})

describe('link index: ordering', () => {
  it('linksFrom, linksTo and brokenLinks are sorted by link id', () => {
    const { index } = setup()
    const l3 = link('l3', { item: 'scene1' }, { item: 'gone' })
    const l1 = link('l1', { item: 'scene1' }, { item: 'gone' })
    const l2 = link('l2', { item: 'scene2' }, { item: 'gone' })
    index.setLinks('scene1', [l3, l1])
    index.setLinks('scene2', [l2])
    expect(index.linksFrom('scene1')).toEqual([l1, l3])
    expect(index.linksTo({ item: 'gone' })).toEqual([l1, l2, l3])
    expect(index.brokenLinks()).toEqual([l1, l2, l3])
  })

  it('order does not depend on the order owners were registered', () => {
    const a = setup()
    const b = setup()
    const l1 = link('l1', { item: 'scene2' }, { item: 'gone' })
    const l2 = link('l2', { item: 'scene1' }, { item: 'gone' })
    a.index.setLinks('scene1', [l2])
    a.index.setLinks('scene2', [l1])
    b.index.setLinks('scene2', [l1])
    b.index.setLinks('scene1', [l2])
    expect(a.index.brokenLinks()).toEqual(b.index.brokenLinks())
  })
})
