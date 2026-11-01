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

import { addLink, removeLink, relinkTarget, EVENT_KIND } from './links'

const ev = (id: string, scene: string, block: string, tl: string, node: string): Link => ({
  id,
  kind: EVENT_KIND,
  from: { item: scene, block },
  to: { item: tl, block: node },
})

describe('link model: add, remove, relink', () => {
  it('adds an event link with the stored shape', () => {
    const r = addLink([], {
      id: 'l1',
      from: { item: 's1', block: 'b1' },
      to: { item: 't1', block: 'n1' },
    })
    expect(r.link).toEqual(ev('l1', 's1', 'b1', 't1', 'n1'))
    expect(r.links).toEqual([r.link])
  })

  it('generates an id when none is given', () => {
    const r = addLink([], { from: { item: 's1', block: 'b1' }, to: { item: 't1', block: 'n1' } })
    expect(r.link?.id).toBeTruthy()
  })

  it('rejects a duplicate block + node and leaves the list unchanged', () => {
    const first = [ev('l1', 's1', 'b1', 't1', 'n1')]
    const r = addLink(first, {
      id: 'l2',
      from: { item: 's1', block: 'b1' },
      to: { item: 't1', block: 'n1' },
    })
    expect(r.link).toBeNull()
    expect(r.reason).toBe('duplicate')
    expect(r.links).toBe(first)
  })

  it('allows one block to link to several nodes and one node from several blocks', () => {
    let links: Link[] = []
    links = addLink(links, {
      id: 'a',
      from: { item: 's1', block: 'b1' },
      to: { item: 't1', block: 'n1' },
    }).links
    links = addLink(links, {
      id: 'b',
      from: { item: 's1', block: 'b1' },
      to: { item: 't1', block: 'n2' },
    }).links
    links = addLink(links, {
      id: 'c',
      from: { item: 's1', block: 'b2' },
      to: { item: 't1', block: 'n1' },
    }).links
    expect(links.map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })

  it('rejects a link without both blocks', () => {
    const r = addLink([], { id: 'x', from: { item: 's1' }, to: { item: 't1', block: 'n1' } })
    expect(r.reason).toBe('invalid')
  })

  it('removeLink removes by id only', () => {
    const links = [ev('l1', 's1', 'b1', 't1', 'n1'), ev('l2', 's1', 'b2', 't1', 'n1')]
    expect(removeLink(links, 'l1')).toEqual([links[1]])
    expect(removeLink(links, 'nope')).toBe(links)
  })

  it('relinkTarget replaces only the target', () => {
    const links = [ev('l1', 's1', 'b1', 't1', 'n1')]
    const r = relinkTarget(links, 'l1', { item: 't2', block: 'n9' })
    expect(r.ok).toBe(true)
    expect(r.links).toEqual([ev('l1', 's1', 'b1', 't2', 'n9')])
  })

  it('relinkTarget refuses a target the block already links to', () => {
    const links = [ev('l1', 's1', 'b1', 't1', 'n1'), ev('l2', 's1', 'b1', 't1', 'n2')]
    const r = relinkTarget(links, 'l1', { item: 't1', block: 'n2' })
    expect(r).toEqual({ links, ok: false, reason: 'duplicate' })
  })

  it('relinkTarget on an unknown id reports not-found', () => {
    expect(relinkTarget([], 'x', { item: 't', block: 'n' }).reason).toBe('not-found')
  })
})

describe('link index: event links', () => {
  function world() {
    const live = new Set(['s1', 's2', 't1'])
    const blocks = new Map<string, Set<string>>([
      ['s1', new Set(['b1'])],
      ['s2', new Set()],
      ['t1', new Set(['n1'])],
    ])
    const index = createLinkIndex({
      isLive: (id) => live.has(id),
      blockExists: (item, block) => blocks.get(item)?.has(block) ?? false,
    })
    return { index, live, blocks }
  }

  it('linksTo lists passages across scenes for a node', () => {
    const { index } = world()
    index.setLinks('s1', [ev('l1', 's1', 'b1', 't1', 'n1')])
    index.setLinks('s2', [ev('l2', 's2', 'b2', 't1', 'n1'), ev('l3', 's2', 'b3', 't1', 'n2')])
    expect(index.linksTo({ item: 't1', block: 'n1' }).map((l) => l.id)).toEqual(['l1', 'l2'])
  })

  it('resolveTarget: ok for a live node', () => {
    const { index } = world()
    expect(index.resolveTarget(ev('l1', 's1', 'b1', 't1', 'n1'))).toEqual({
      ok: true,
      kind: 'node',
    })
  })

  it('resolveTarget: missing node, missing timeline', () => {
    const { index } = world()
    expect(index.resolveTarget(ev('l1', 's1', 'b1', 't1', 'gone'))).toEqual({
      ok: false,
      reason: 'missing-node',
    })
    expect(index.resolveTarget(ev('l1', 's1', 'b1', 'tX', 'n1'))).toEqual({
      ok: false,
      reason: 'missing-timeline',
    })
  })

  it('resolveTarget from side: block, missing block, missing scene', () => {
    const { index } = world()
    expect(index.resolveTarget(ev('l1', 's1', 'b1', 't1', 'n1'), 'from')).toEqual({
      ok: true,
      kind: 'block',
    })
    expect(index.resolveTarget(ev('l1', 's1', 'bX', 't1', 'n1'), 'from')).toEqual({
      ok: false,
      reason: 'missing-block',
    })
    expect(index.resolveTarget(ev('l1', 'sX', 'b1', 't1', 'n1'), 'from')).toEqual({
      ok: false,
      reason: 'missing-scene',
    })
  })

  it('passage side: block missing from its scene, or scene trashed', () => {
    const { index, live } = world()
    const ok = ev('l1', 's1', 'b1', 't1', 'n1')
    const noBlock = ev('l2', 's1', 'bX', 't1', 'n1')
    index.setLinks('s1', [ok, noBlock])
    expect(index.isPassageBroken(ok)).toBe(false)
    expect(index.isPassageBroken(noBlock)).toBe(true)
    live.delete('s1')
    expect(index.isPassageBroken(ok)).toBe(true)
  })

  it('isBroken stays target-only; isAnyBroken covers both sides', () => {
    const { index } = world()
    const l = ev('l1', 's1', 'bX', 't1', 'n1')
    expect(index.isBroken(l)).toBe(false)
    expect(index.isAnyBroken(l)).toBe(true)
    expect(index.isAnyBroken(ev('l2', 's1', 'b1', 't1', 'gone'))).toBe(true)
    expect(index.isAnyBroken(ev('l3', 's1', 'b1', 't1', 'n1'))).toBe(false)
  })

  it('never drops links when targets vanish; repaired when they return', () => {
    const { index, blocks } = world()
    const l = ev('l1', 's1', 'b1', 't1', 'n1')
    index.setLinks('s1', [l])
    blocks.get('t1')?.delete('n1')
    expect(index.isBroken(l)).toBe(true)
    expect(index.linksTo({ item: 't1', block: 'n1' })).toEqual([l])
    blocks.get('t1')?.add('n1')
    expect(index.isBroken(l)).toBe(false)
  })

  it('revision is bumped by setLinks and removeOwner', () => {
    const { index } = world()
    const r0 = index.revision.value
    index.setLinks('s1', [])
    const r1 = index.revision.value
    index.removeOwner('s1')
    expect(r1).toBeGreaterThan(r0)
    expect(index.revision.value).toBeGreaterThan(r1)
  })
})
