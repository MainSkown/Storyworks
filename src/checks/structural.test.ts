import { describe, expect, it } from 'vitest'
import { CODEX_KIND, EVENT_KIND, KNOWLEDGE_KIND, type Link } from '../project/links'
import {
  brokenLinks,
  coverageFindings,
  duplicateNames,
  entriesWithoutConnections,
  invalidFiles,
  isolatedNodes,
  openTodos,
  unlinkedRules,
} from './structural'

const ev = (id: string, scene = 's1', block = 'b1', tl = 't1', node = 'n1'): Link => ({
  id,
  kind: EVENT_KIND,
  from: { item: scene, block },
  to: { item: tl, block: node },
})

describe('brokenLinks', () => {
  const base = {
    passageLabel: () => 'Snippet',
    targetLabel: () => 'Node A',
  }
  it('reports a missing target with passage and target locations', () => {
    const f = brokenLinks({
      ...base,
      links: [ev('l1')],
      check: { targetMissing: () => true, passageMissing: () => false },
    })
    expect(f).toHaveLength(1)
    expect(f[0]!.id).toBe('broken-link:l1')
    expect(f[0]!.severity).toBe('error')
    expect(f[0]!.locations).toEqual([
      { kind: 'scene', id: 's1', blockId: 'b1', label: 'Snippet' },
      { kind: 'node', id: 'n1', timelineId: 't1', label: 'Node A' },
    ])
  })
  it('reports a missing passage', () => {
    const f = brokenLinks({
      ...base,
      links: [ev('l1')],
      check: { targetMissing: () => false, passageMissing: () => true },
    })
    expect(f).toHaveLength(1)
    expect(f[0]!.locations[0]!.kind).toBe('scene')
  })
  it('points a codex link at the entry, leaves a knowledge link without target', () => {
    const codex: Link = {
      id: 'c',
      kind: CODEX_KIND,
      from: { item: 's1', block: 'b1' },
      to: { item: 'e1' },
    }
    const know: Link = {
      id: 'k',
      kind: KNOWLEDGE_KIND,
      from: { item: 's1', block: 'b1' },
      to: { item: 'k1', entry: 'e1' },
    }
    const f = brokenLinks({
      ...base,
      links: [codex, know],
      check: { targetMissing: () => true, passageMissing: () => false },
    })
    expect(f[0]!.locations[1]).toEqual({ kind: 'entry', id: 'e1', label: 'Node A' })
    expect(f[1]!.locations).toHaveLength(1)
  })
  it('skips the target when it has no label', () => {
    const f = brokenLinks({
      ...base,
      targetLabel: () => null,
      links: [ev('l1')],
      check: { targetMissing: () => true, passageMissing: () => false },
    })
    expect(f[0]!.locations).toHaveLength(1)
  })
  it('gives no finding for healthy links', () => {
    expect(
      brokenLinks({
        ...base,
        links: [ev('l1')],
        check: { targetMissing: () => false, passageMissing: () => false },
      }),
    ).toEqual([])
  })
  it('reports broken references from nodes, rules and entries', () => {
    const f = brokenLinks({
      ...base,
      links: [],
      check: { targetMissing: () => false, passageMissing: () => false },
      refs: [
        {
          ownerKind: 'node',
          ownerId: 't1',
          ownerBlockId: 'n1',
          ownerLabel: 'Node A',
          targetId: 'e9',
        },
      ],
    })
    expect(f).toHaveLength(1)
    expect(f[0]!.id).toBe('broken-link:t1:n1:e9')
    expect(f[0]!.locations).toEqual([{ kind: 'node', id: 'n1', timelineId: 't1', label: 'Node A' }])
  })
  it('has a stable id', () => {
    const run = () =>
      brokenLinks({
        ...base,
        links: [ev('l1')],
        check: { targetMissing: () => true, passageMissing: () => false },
      })[0]!.id
    expect(run()).toBe(run())
  })
})

describe('invalidFiles', () => {
  it('reports missing and invalid files, skips unlisted', () => {
    const f = invalidFiles([
      { kind: 'missing', itemId: 'a', path: 'scenes/a.json', title: 'Dawn' },
      { kind: 'invalid', itemId: 'b', path: 'rules/b.json', error: { message: 'bad field' } },
      { kind: 'unlisted', path: 'x.json' },
    ])
    expect(f.map((x) => x.id)).toEqual(['invalid-file:a', 'invalid-file:b'])
    expect(f[0]!.locations).toEqual([{ kind: 'file', id: 'a', label: 'Dawn' }])
    expect(f[1]!.locations[0]!.label).toBe('rules/b.json')
    expect(f[1]!.message).toContain('bad field')
  })
  it('gives none for no problems', () => {
    expect(invalidFiles([])).toEqual([])
  })
})

describe('duplicateNames', () => {
  const e = (id: string, name: string, aliases: string[] = [], typeId = 'char') => ({
    id,
    typeId,
    name,
    aliases,
  })
  it('flags equal names ignoring case and spaces', () => {
    const f = duplicateNames([e('a', 'Anna'), e('b', '  anna ')])
    expect(f).toHaveLength(1)
    expect(f[0]!.id).toBe('duplicate-name:a:b')
    expect(f[0]!.locations.map((l) => l.id)).toEqual(['a', 'b'])
  })
  it('flags a name that equals an alias, with a symmetric id', () => {
    const one = duplicateNames([e('a', 'Anna'), e('b', 'Ann', ['ANNA'])])
    const two = duplicateNames([e('b', 'Ann', ['ANNA']), e('a', 'Anna')])
    expect(one).toHaveLength(1)
    expect(one[0]!.id).toBe(two[0]!.id)
  })
  it('flags colliding aliases', () => {
    expect(duplicateNames([e('a', 'A', ['x']), e('b', 'B', ['X'])])).toHaveLength(1)
  })
  it('ignores other types, distinct names and empty names', () => {
    expect(duplicateNames([e('a', 'Anna'), e('b', 'Anna', [], 'place')])).toEqual([])
    expect(duplicateNames([e('a', 'Anna'), e('b', 'Bob')])).toEqual([])
    expect(duplicateNames([e('a', ''), e('b', ' ')])).toEqual([])
  })
  it('reports one finding per pair even if name and alias both collide', () => {
    expect(duplicateNames([e('a', 'Anna', ['Ann']), e('b', 'anna', ['ann'])])).toHaveLength(1)
  })
  it('reports each pair of three entries', () => {
    expect(duplicateNames([e('a', 'X'), e('b', 'X'), e('c', 'X')])).toHaveLength(3)
  })
})

describe('isolatedNodes', () => {
  const tl = (nodes: string[], edges: [string, string][]) => ({
    id: 't1',
    name: 'Main',
    nodes: nodes.map((id) => ({ id, title: id.toUpperCase() })),
    edges: edges.map(([from, to]) => ({ from, to })),
  })
  it('flags a node with no edges in a timeline of several nodes', () => {
    const f = isolatedNodes([tl(['a', 'b', 'c'], [['a', 'b']])])
    expect(f).toHaveLength(1)
    expect(f[0]!.id).toBe('isolated-node:t1:c')
    expect(f[0]!.locations).toEqual([{ kind: 'node', id: 'c', timelineId: 't1', label: 'C' }])
  })
  it('gives none for a single node or connected nodes', () => {
    expect(isolatedNodes([tl(['a'], [])])).toEqual([])
    expect(isolatedNodes([tl(['a', 'b'], [['a', 'b']])])).toEqual([])
  })
})

describe('unlinkedRules', () => {
  const rules = [
    { id: 'r1', title: 'Magic costs blood' },
    { id: 'r2', title: 'No flight' },
  ]
  it('flags rules used by no node or entry', () => {
    const f = unlinkedRules({
      rules,
      nodes: [{ ruleIds: ['r1'] }],
      entries: [],
    })
    expect(f.map((x) => x.id)).toEqual(['unlinked-rule:r2'])
    expect(f[0]!.locations).toEqual([{ kind: 'rule', id: 'r2', label: 'No flight' }])
  })
  it('counts entry links and extra linked ids', () => {
    expect(
      unlinkedRules({
        rules,
        nodes: [],
        entries: [{ ruleIds: ['r1'] }],
        otherLinkedIds: ['r2'],
      }),
    ).toEqual([])
  })
})

describe('entriesWithoutConnections', () => {
  const base = { relationships: [], groups: [], links: [], nodes: [], rules: [] as never[] }
  const entries = [
    { id: 'e1', name: 'Anna', ruleIds: [] },
    { id: 'e2', name: 'Bob', ruleIds: [] },
  ]
  it('flags entries with nothing attached', () => {
    const f = entriesWithoutConnections({ ...base, entries })
    expect(f.map((x) => x.id)).toEqual(['entry-no-connections:e1', 'entry-no-connections:e2'])
    expect(f[0]!.locations).toEqual([{ kind: 'entry', id: 'e1', label: 'Anna' }])
  })
  it('counts relationships, groups, scene links, node links and rule links', () => {
    const codex: Link = {
      id: 'c',
      kind: CODEX_KIND,
      from: { item: 's', block: 'b' },
      to: { item: 'e1' },
    }
    expect(
      entriesWithoutConnections({
        ...base,
        entries: [
          ...entries,
          { id: 'e3', name: 'Cy', ruleIds: ['r1'] },
          { id: 'e4', name: 'Di', ruleIds: [] },
        ],
        relationships: [{ fromId: 'e2', toId: 'x' }],
        links: [codex],
        groups: [{ memberIds: ['e4'] }],
      }),
    ).toEqual([])
    expect(
      entriesWithoutConnections({ ...base, entries: [entries[0]!], nodes: [{ codexIds: ['e1'] }] }),
    ).toEqual([])
  })
  it('counts a knowledge use link and extra linked ids', () => {
    const know: Link = {
      id: 'k',
      kind: KNOWLEDGE_KIND,
      from: { item: 's', block: 'b' },
      to: { item: 'k1', entry: 'e1' },
    }
    expect(
      entriesWithoutConnections({
        ...base,
        entries,
        links: [know],
        otherLinkedIds: ['e2'],
      }),
    ).toEqual([])
  })
})

describe('coverageFindings', () => {
  const nodes = [
    { timelineId: 't1', id: 'n1', title: 'Arrival' },
    { timelineId: 't1', id: 'n2', title: 'Escape' },
  ]
  const scenes = [
    { id: 's1', title: 'Dawn', wordCount: 100 },
    { id: 's2', title: 'Dusk', wordCount: 50 },
    { id: 's3', title: 'Empty', wordCount: 0 },
  ]
  it('flags unlinked nodes and scenes with text', () => {
    const f = coverageFindings({
      nodes,
      scenes,
      links: [ev('l1', 's1', 'b1', 't1', 'n1')],
      isBroken: () => false,
    })
    expect(f.map((x) => x.id)).toEqual(['node-no-passage:t1:n2', 'scene-no-links:s2'])
    expect(f[0]!.locations).toEqual([{ kind: 'node', id: 'n2', timelineId: 't1', label: 'Escape' }])
    expect(f[1]!.locations).toEqual([{ kind: 'scene', id: 's2', label: 'Dusk' }])
  })
  it('gives none when everything is linked', () => {
    const links = [ev('l1', 's1', 'b1', 't1', 'n1'), ev('l2', 's2', 'b2', 't1', 'n2')]
    expect(coverageFindings({ nodes, scenes, links, isBroken: () => false })).toEqual([])
  })
  it('does not count broken links', () => {
    const links = [ev('l1', 's1', 'b1', 't1', 'n1'), ev('l2', 's2', 'b2', 't1', 'n2')]
    expect(coverageFindings({ nodes, scenes, links, isBroken: (l) => l.id === 'l2' })).toHaveLength(
      2,
    )
  })
})

describe('openTodos', () => {
  it('flags a scene with open to-dos only', () => {
    const f = openTodos([
      {
        id: 's1',
        title: 'Dawn',
        todos: [
          { id: 't1', done: false },
          { id: 't2', done: true },
        ],
      },
      { id: 's2', title: 'Dusk', todos: [{ id: 't3', done: true }] },
      { id: 's3', title: 'None', todos: [] },
    ])
    expect(f).toHaveLength(1)
    expect(f[0]!.id).toBe('open-todo:s1:t1')
    expect(f[0]!.locations).toEqual([{ kind: 'scene', id: 's1', label: 'Dawn' }])
  })
  it('changes the id when the set of open to-dos changes, not with their order', () => {
    const id = (todos: { id: string; done: boolean }[]) =>
      openTodos([{ id: 's1', title: 'D', todos }])[0]!.id
    const a = { id: 'a', done: false }
    const b = { id: 'b', done: false }
    expect(id([a, b])).toBe(id([b, a]))
    expect(id([a])).not.toBe(id([a, b]))
  })
})
