import { describe, expect, it } from 'vitest'
import {
  addCodexLink,
  addLink,
  CODEX_KIND,
  createLinkIndex,
  EVENT_KIND,
  relinkTarget,
  type Link,
} from './links'
import { coverage } from './coverage'
import { brokenByDeletingEntry, brokenByDeletingScenes } from './deleteImpact'
import { findRehomes } from './rehome'
import { buildProblems } from './linkProblems'
import { sceneSchema, SCENE_VERSION } from './schemas/scene'

const cl = (id: string, scene: string, block: string, entry = 'e1'): Link => ({
  id,
  kind: CODEX_KIND,
  from: { item: scene, block },
  to: { item: entry },
})

describe('scene codex links: add', () => {
  it('adds a codex link without a target block', () => {
    const r = addCodexLink([], { id: 'l1', sceneId: 's1', blockId: 'b1', entryId: 'e1' })
    expect(r.link).toEqual({
      id: 'l1',
      kind: 'codex',
      from: { item: 's1', block: 'b1' },
      to: { item: 'e1' },
    })
    expect(r.links).toHaveLength(1)
  })

  it('is unique per (block, entry)', () => {
    const first = addCodexLink([], { sceneId: 's1', blockId: 'b1', entryId: 'e1' })
    const dup = addCodexLink(first.links, { sceneId: 's1', blockId: 'b1', entryId: 'e1' })
    expect(dup.link).toBeNull()
    expect(dup.reason).toBe('duplicate')
    expect(dup.links).toBe(first.links)
  })

  it('allows another entry on the block and the same entry on another block', () => {
    let links: Link[] = addCodexLink([], { sceneId: 's1', blockId: 'b1', entryId: 'e1' }).links
    links = addCodexLink(links, { sceneId: 's1', blockId: 'b1', entryId: 'e2' }).links
    links = addCodexLink(links, { sceneId: 's1', blockId: 'b2', entryId: 'e1' }).links
    expect(links).toHaveLength(3)
  })

  it('refuses a missing passage block or a target block', () => {
    expect(addLink([], { kind: CODEX_KIND, from: { item: 's1' }, to: { item: 'e1' } }).reason).toBe(
      'invalid',
    )
    expect(
      addLink([], {
        kind: CODEX_KIND,
        from: { item: 's1', block: 'b1' },
        to: { item: 'e1', block: 'x' },
      }).reason,
    ).toBe('invalid')
  })

  it('an event link and a codex link on one block do not clash', () => {
    const ev = addLink([], {
      from: { item: 's1', block: 'b1' },
      to: { item: 't1', block: 'n1' },
    })
    expect(ev.link?.kind).toBe(EVENT_KIND)
    const both = addCodexLink(ev.links, { sceneId: 's1', blockId: 'b1', entryId: 'e1' })
    expect(both.links).toHaveLength(2)
  })

  it('event links still need both blocks', () => {
    expect(addLink([], { from: { item: 's1', block: 'b1' }, to: { item: 't1' } }).reason).toBe(
      'invalid',
    )
  })

  it('repointing a codex link to another entry works and refuses a duplicate', () => {
    const links = [cl('l1', 's1', 'b1', 'e1'), cl('l2', 's1', 'b1', 'e2')]
    expect(relinkTarget(links, 'l1', { item: 'e2' }).reason).toBe('duplicate')
    const ok = relinkTarget(links, 'l1', { item: 'e3' })
    expect(ok.ok).toBe(true)
    expect(ok.links[0].to).toEqual({ item: 'e3' })
    expect(ok.links[0].kind).toBe(CODEX_KIND)
  })

  it('a codex link cannot be repointed to a node block', () => {
    expect(relinkTarget([cl('l1', 's1', 'b1')], 'l1', { item: 't1', block: 'n1' }).ok).toBe(false)
  })
})

describe('scene codex links: broken and repaired', () => {
  function setup() {
    const live = new Set(['s1', 'e1'])
    const index = createLinkIndex({
      isLive: (id) => live.has(id),
      blockExists: (item, block) => (item === 's1' ? block === 'b1' : true),
    })
    index.setLinks('s1', [cl('l1', 's1', 'b1')])
    return { index, live }
  }

  it('is fine while the entry is listed', () => {
    const { index } = setup()
    const l = index.linksFrom('s1')[0]
    expect(index.isBroken(l)).toBe(false)
    expect(index.resolveTarget(l)).toEqual({ ok: true, kind: 'entry' })
  })

  it('is broken (not dropped) when the entry is gone or trashed, repaired on restore', () => {
    const { index, live } = setup()
    live.delete('e1')
    const l = index.linksFrom('s1')[0]
    expect(index.isBroken(l)).toBe(true)
    expect(index.isAnyBroken(l)).toBe(true)
    expect(index.resolveTarget(l)).toEqual({ ok: false, reason: 'missing-entry' })
    expect(index.brokenLinks()).toHaveLength(1)
    live.add('e1')
    expect(index.isBroken(l)).toBe(false)
    expect(index.brokenLinks()).toEqual([])
  })

  it('passage side: a missing block or scene breaks the passage, not the entry', () => {
    const { index } = setup()
    const gone = cl('l2', 's1', 'gone')
    expect(index.isPassageBroken(gone)).toBe(true)
    expect(index.isBroken(gone)).toBe(false)
    expect(index.resolveTarget(gone, 'from')).toEqual({ ok: false, reason: 'missing-block' })
  })

  it('linksTo(entry) finds every passage of the entry across scenes', () => {
    const { index } = setup()
    index.setLinks('s2', [cl('l2', 's2', 'b9')])
    index.setLinks('s3', [cl('l3', 's3', 'b9', 'e2')])
    expect(index.linksTo({ item: 'e1' }).map((l) => l.id)).toEqual(['l1', 'l2'])
  })

  it('event link targets still resolve as nodes', () => {
    const index = createLinkIndex({ isLive: () => true })
    const ev: Link = {
      id: 'x',
      kind: EVENT_KIND,
      from: { item: 's1', block: 'b' },
      to: { item: 't1', block: 'n1' },
    }
    expect(index.resolveTarget(ev)).toEqual({ ok: true, kind: 'node' })
  })
})

describe('scene codex links: re-home, coverage, impact, problems', () => {
  it('re-homes a codex link with its block', () => {
    const r = findRehomes({
      links: new Map([['s1', [cl('l1', 's1', 'b1')]]]),
      blocks: new Map([
        ['s1', new Set<string>()],
        ['s2', new Set(['b1'])],
      ]),
      isLive: () => true,
    })
    expect(r.moves).toEqual([{ from: 's1', to: 's2', link: cl('l1', 's2', 'b1') }])
  })

  it('does not treat a codex and an event link on one block as copies', () => {
    const ev: Link = {
      id: 'l2',
      kind: EVENT_KIND,
      from: { item: 's2', block: 'b1' },
      to: { item: 'e1', block: 'n' },
    }
    const r = findRehomes({
      links: new Map([
        ['s1', [cl('l1', 's1', 'b1')]],
        ['s2', [ev]],
      ]),
      blocks: new Map([
        ['s1', new Set<string>()],
        ['s2', new Set(['b1'])],
      ]),
      isLive: () => true,
    })
    expect(r.moves).toHaveLength(1)
    expect(r.dupes).toEqual([])
  })

  it('drops a duplicate codex link when the destination already has it', () => {
    const r = findRehomes({
      links: new Map([
        ['s1', [cl('l1', 's1', 'b1')]],
        ['s2', [cl('l2', 's2', 'b1')]],
      ]),
      blocks: new Map([
        ['s1', new Set<string>()],
        ['s2', new Set(['b1'])],
      ]),
      isLive: () => true,
    })
    expect(r.moves).toEqual([])
    expect(r.dupes).toEqual([{ owner: 's1', linkId: 'l1' }])
  })

  it('coverage is event-only: codex links count for neither side', () => {
    const r = coverage({
      nodeIds: ['n1'],
      scenes: [{ id: 's1', wordCount: 10 }],
      links: [cl('l1', 's1', 'b1')],
      isBroken: () => false,
    })
    expect(r).toEqual({ nodesWithoutPassages: ['n1'], scenesWithoutLinks: ['s1'] })
  })

  it('deleting an entry counts its passages; deleting a scene counts its codex links', () => {
    const index = createLinkIndex({ isLive: () => true })
    index.setLinks('s1', [cl('l1', 's1', 'b1'), cl('l2', 's1', 'b2', 'e2')])
    index.setLinks('s2', [cl('l3', 's2', 'b1')])
    expect(brokenByDeletingEntry(index, 'e1')).toBe(2)
    expect(brokenByDeletingEntry(index, 'nope')).toBe(0)
    expect(brokenByDeletingScenes(index, ['s1'])).toBe(2)
  })

  it('problems: a missing entry can be relinked, a missing passage cannot', () => {
    const l = cl('l1', 's1', 'b1')
    const [p] = buildProblems([l], { targetMissing: () => true, passageMissing: () => false })
    expect(p.canRelink).toBe(true)
    const [q] = buildProblems([l], { targetMissing: () => true, passageMissing: () => true })
    expect(q.canRelink).toBe(false)
  })
})

describe('scene file with a codex link', () => {
  it('validates unchanged: no schema or version change needed', () => {
    const scene = {
      version: SCENE_VERSION,
      id: 's1',
      title: 'S',
      content: { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'b1' } }] },
      links: [cl('l1', 's1', 'b1')],
    }
    const r = sceneSchema.safeParse(scene)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.links[0]).toEqual(cl('l1', 's1', 'b1'))
  })
})
