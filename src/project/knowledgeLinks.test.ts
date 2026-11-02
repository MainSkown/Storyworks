import { describe, expect, it } from 'vitest'
import {
  addKnowledgeLink,
  addLink,
  createLinkIndex,
  KNOWLEDGE_KIND,
  knowledgeUsesInScene,
  knowledgeUsesOfPair,
  relinkTarget,
  type Link,
} from './links'
import { coverage } from './coverage'
import { findRehomes } from './rehome'
import { buildProblems, linkTargetMissing } from './linkProblems'
import { sceneSchema, SCENE_VERSION } from './schemas/scene'

const kl = (id: string, scene: string, block: string, item = 'k1', entry = 'e1'): Link => ({
  id,
  kind: KNOWLEDGE_KIND,
  from: { item: scene, block },
  to: { item, entry },
})

describe('knowledge links: add', () => {
  it('adds a pair link with an entry and no target block', () => {
    const r = addKnowledgeLink([], {
      id: 'l1',
      sceneId: 's1',
      blockId: 'b1',
      itemId: 'k1',
      entryId: 'e1',
    })
    expect(r.link).toEqual({
      id: 'l1',
      kind: 'knowledge',
      from: { item: 's1', block: 'b1' },
      to: { item: 'k1', entry: 'e1' },
    })
  })

  it('is unique per (block, item, entry)', () => {
    const first = addKnowledgeLink([], {
      sceneId: 's1',
      blockId: 'b1',
      itemId: 'k1',
      entryId: 'e1',
    })
    const dup = addKnowledgeLink(first.links, {
      sceneId: 's1',
      blockId: 'b1',
      itemId: 'k1',
      entryId: 'e1',
    })
    expect(dup.reason).toBe('duplicate')
    expect(dup.links).toBe(first.links)
  })

  it('allows another entry, another item or another block', () => {
    let links: Link[] = addKnowledgeLink([], {
      sceneId: 's1',
      blockId: 'b1',
      itemId: 'k1',
      entryId: 'e1',
    }).links
    links = addKnowledgeLink(links, {
      sceneId: 's1',
      blockId: 'b1',
      itemId: 'k1',
      entryId: 'e2',
    }).links
    links = addKnowledgeLink(links, {
      sceneId: 's1',
      blockId: 'b1',
      itemId: 'k2',
      entryId: 'e1',
    }).links
    links = addKnowledgeLink(links, {
      sceneId: 's1',
      blockId: 'b2',
      itemId: 'k1',
      entryId: 'e1',
    }).links
    expect(links).toHaveLength(4)
  })

  it('refuses a missing entry, a missing passage block or a target block', () => {
    const base = {
      kind: KNOWLEDGE_KIND,
      from: { item: 's1', block: 'b1' },
      to: { item: 'k1', entry: 'e1' },
    }
    expect(addLink([], { ...base, to: { item: 'k1' } }).reason).toBe('invalid')
    expect(addLink([], { ...base, from: { item: 's1' } }).reason).toBe('invalid')
    expect(addLink([], { ...base, to: { item: 'k1', entry: 'e1', block: 'x' } }).reason).toBe(
      'invalid',
    )
  })

  it('does not clash with a codex or event link on the same block', () => {
    const ev = addLink([], { from: { item: 's1', block: 'b1' }, to: { item: 'k1', block: 'n1' } })
    const both = addKnowledgeLink(ev.links, {
      sceneId: 's1',
      blockId: 'b1',
      itemId: 'k1',
      entryId: 'e1',
    })
    expect(both.links).toHaveLength(2)
  })

  it('repointing keeps the pair rules: duplicate refused, entry required', () => {
    const links = [kl('l1', 's1', 'b1', 'k1', 'e1'), kl('l2', 's1', 'b1', 'k1', 'e2')]
    expect(relinkTarget(links, 'l1', { item: 'k1', entry: 'e2' }).reason).toBe('duplicate')
    expect(relinkTarget(links, 'l1', { item: 'k1' }).reason).toBe('invalid')
    const ok = relinkTarget(links, 'l1', { item: 'k1', entry: 'e3' })
    expect(ok.links[0].to).toEqual({ item: 'k1', entry: 'e3' })
  })
})

describe('knowledge links: back-links', () => {
  const links = [
    kl('l1', 's1', 'b1', 'k1', 'e1'),
    kl('l2', 's2', 'b2', 'k1', 'e1'),
    kl('l3', 's1', 'b3', 'k1', 'e2'),
    kl('l4', 's1', 'b4', 'k2', 'e1'),
    { id: 'c1', kind: 'codex', from: { item: 's1', block: 'b1' }, to: { item: 'k1' } },
  ] as Link[]

  it('uses of a pair, across scenes', () => {
    expect(knowledgeUsesOfPair(links, 'k1', 'e1').map((l) => l.id)).toEqual(['l1', 'l2'])
  })

  it('uses in a scene', () => {
    expect(knowledgeUsesInScene(links, 's1').map((l) => l.id)).toEqual(['l1', 'l3', 'l4'])
  })
})

describe('knowledge links: broken and repaired', () => {
  function setup() {
    const live = new Set(['s1', 'k1', 'e1'])
    const index = createLinkIndex({
      isLive: (id) => live.has(id),
      blockExists: (item, block) => (item === 's1' ? block === 'b1' : true),
    })
    index.setLinks('s1', [kl('l1', 's1', 'b1')])
    return { index, live }
  }

  it('is live while both item and entry are live', () => {
    const { index } = setup()
    const l = index.linksFrom('s1')[0]
    expect(index.isBroken(l)).toBe(false)
    expect(index.resolveTarget(l)).toEqual({ ok: true, kind: 'knowledge' })
  })

  it('is broken when the item is gone, restored when it returns', () => {
    const { index, live } = setup()
    live.delete('k1')
    const l = index.linksFrom('s1')[0]
    expect(index.isBroken(l)).toBe(true)
    expect(index.resolveTarget(l)).toEqual({ ok: false, reason: 'missing-knowledge' })
    expect(index.brokenLinks()).toHaveLength(1)
    live.add('k1')
    expect(index.isBroken(l)).toBe(false)
  })

  it('is broken when only the entry is gone', () => {
    const { index, live } = setup()
    live.delete('e1')
    const l = index.linksFrom('s1')[0]
    expect(index.isBroken(l)).toBe(true)
    expect(index.resolveTarget(l)).toEqual({ ok: false, reason: 'missing-entry' })
  })

  it('a missing passage block breaks the passage side only', () => {
    const { index } = setup()
    const gone = kl('l9', 's1', 'zzz')
    index.setLinks('s1', [gone])
    expect(index.isBroken(gone)).toBe(false)
    expect(index.isPassageBroken(gone)).toBe(true)
    expect(index.resolveTarget(gone, 'from')).toEqual({ ok: false, reason: 'missing-block' })
  })
})

describe('knowledge links: re-home, coverage, problems', () => {
  it('re-homes with its block', () => {
    const r = findRehomes({
      links: new Map([['s1', [kl('l1', 's1', 'b1')]]]),
      blocks: new Map([
        ['s1', new Set<string>()],
        ['s2', new Set(['b1'])],
      ]),
      isLive: () => true,
    })
    expect(r.moves).toEqual([{ from: 's1', to: 's2', link: kl('l1', 's2', 'b1') }])
  })

  it('two pairs of one item on one block are not copies of each other', () => {
    const r = findRehomes({
      links: new Map([
        ['s1', [kl('l1', 's1', 'b1', 'k1', 'e1'), kl('l2', 's1', 'b1', 'k1', 'e2')]],
        ['s2', []],
      ]),
      blocks: new Map([
        ['s1', new Set<string>()],
        ['s2', new Set(['b1'])],
      ]),
      isLive: () => true,
    })
    expect(r.moves).toHaveLength(2)
    expect(r.dupes).toEqual([])
  })

  it('drops a duplicate when the destination already has the same pair', () => {
    const r = findRehomes({
      links: new Map([
        ['s1', [kl('l1', 's1', 'b1')]],
        ['s2', [kl('l2', 's2', 'b1')]],
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

  it('coverage ignores knowledge links', () => {
    const r = coverage({
      nodeIds: ['n1'],
      scenes: [{ id: 's1', wordCount: 10 }],
      links: [kl('l1', 's1', 'b1')],
      isBroken: () => false,
    })
    expect(r.scenesWithoutLinks).toEqual(['s1'])
    expect(r.nodesWithoutPassages).toEqual(['n1'])
  })

  it('problems: a missing item or entry is a target problem, with a knowledge reason', () => {
    const l = kl('l1', 's1', 'b1')
    expect(linkTargetMissing(l, { isBroken: () => true, nodeExists: () => false })).toBe(true)
    expect(linkTargetMissing(l, { isBroken: () => false, nodeExists: () => false })).toBe(false)
    const [p] = buildProblems([l], { targetMissing: () => true, passageMissing: () => false })
    expect(p.reason).toBe('knowledge-missing')
    expect(p.canRelink).toBe(true)
  })

  it('problems: a missing passage wins as the reason; codex and event reasons', () => {
    const only = { targetMissing: () => true, passageMissing: () => false }
    const both = { targetMissing: () => true, passageMissing: () => true }
    expect(buildProblems([kl('l1', 's1', 'b1')], both)[0].reason).toBe('passage-missing')
    const codex: Link = {
      id: 'c',
      kind: 'codex',
      from: { item: 's', block: 'b' },
      to: { item: 'e' },
    }
    const event: Link = {
      id: 'v',
      kind: 'event',
      from: { item: 's', block: 'b' },
      to: { item: 't', block: 'n' },
    }
    expect(buildProblems([codex], only)[0].reason).toBe('entry-missing')
    expect(buildProblems([event], only)[0].reason).toBe('node-missing')
  })
})

describe('scene file with a knowledge link', () => {
  const scene = (links: unknown[]) => ({
    version: SCENE_VERSION,
    id: 's1',
    title: 'S',
    content: { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'b1' } }] },
    links,
  })

  it('validates and keeps the entry', () => {
    const r = sceneSchema.safeParse(scene([kl('l1', 's1', 'b1')]))
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.links[0]).toEqual(kl('l1', 's1', 'b1'))
  })

  it('rejects a non-string entry and unknown link fields', () => {
    expect(
      sceneSchema.safeParse(scene([{ ...kl('l1', 's1', 'b1'), to: { item: 'k', entry: 5 } }]))
        .success,
    ).toBe(false)
    expect(sceneSchema.safeParse(scene([{ ...kl('l1', 's1', 'b1'), extra: 1 }])).success).toBe(
      false,
    )
  })

  it('is version 3', () => {
    expect(SCENE_VERSION).toBe(3)
  })
})
