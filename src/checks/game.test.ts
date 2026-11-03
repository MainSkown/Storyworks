import { describe, expect, it } from 'vitest'
import { conversationSchema, type Conversation } from '../project/schemas/conversation'
import type { RouteRef } from '../project/schemas/route'
import type { StoryMap } from '../project/schemas/storyMap'
import type { Variable } from '../project/schemas/variables'
import {
  brokenSpeakers,
  choiceNoTarget,
  deadEnds,
  routeUnreachable,
  speakerIdsOf,
  undefinedVariables,
  unreachableItems,
  unreachableNodes,
  type GameCheckItem,
  type GraphCheckInput,
} from './game'

type N = Record<string, unknown>
const doc = { type: 'doc', content: [] }
const lines = (id: string, next: string | null = null, extra: N = {}): N => ({
  id, type: 'lines', x: 0, y: 0, sets: [], content: doc, next, ...extra,
})
const choice = (id: string, options: N[] = [], extra: N = {}): N => ({
  id, type: 'choice', x: 0, y: 0, sets: [], options, ...extra,
})
const opt = (id: string, target: string | null = null, extra: N = {}): N => ({
  id, text: id, target, sets: [], ...extra,
})
const jump = (id: string, target: string | null = null, extra: N = {}): N => ({
  id, type: 'jump', x: 0, y: 0, sets: [], target: target === null ? null : { nodeId: target }, ...extra,
})
const end = (id: string): N => ({ id, type: 'end', x: 0, y: 0, sets: [] })

const conv = (id: string, nodes: N[], start: string | null = (nodes[0]?.id as string) ?? null): Conversation =>
  conversationSchema.parse({ version: 3, id, title: id, startNodeId: start, nodes })

const item = (id: string, type: GameCheckItem['type'] = 'conversation', extra: Partial<GameCheckItem> = {}): GameCheckItem => ({
  id, title: `T-${id}`, type, trashed: false, ...extra,
})

const emptyMap: StoryMap = { version: 1, boxes: [], arrows: [] }
const box = (id: string, itemId: string, start = false) => ({ kind: 'item' as const, id, itemId, x: 0, y: 0, start })
const beat = (id: string, start = false) => ({ kind: 'beat' as const, id, text: id, x: 0, y: 0, start })
const arrow = (from: string, to: string) => ({ id: `${from}>${to}`, from, to })
const map = (boxes: StoryMap['boxes'], arrows: StoryMap['arrows'] = []): StoryMap => ({ version: 1, boxes, arrows })

const input = (
  items: GameCheckItem[],
  convs: Conversation[] = [],
  extra: Partial<GraphCheckInput> = {},
): GraphCheckInput => ({
  items,
  conversations: new Map(convs.map((c) => [c.id, c])),
  variables: [],
  map: emptyMap,
  routes: [],
  ...extra,
})

const single = (nodes: N[], start?: string | null) => input([item('c1')], [conv('c1', nodes, start)])
const ids = (f: { id: string }[]) => f.map((x) => x.id)

describe('deadEnds', () => {
  it('flags a lines node without next', () => {
    const f = deadEnds(single([lines('a')]))
    expect(ids(f)).toEqual(['dead-end:c1:a'])
    expect(f[0]!.severity).toBe('warning')
    expect(f[0]!.params).toEqual({ node: expect.any(String), item: 'T-c1' })
    expect(f[0]!.locations).toEqual([{ kind: 'item', id: 'c1', nodeId: 'a', label: 'T-c1' }])
  })
  it('flags a choice with no options and one whose options all lack a target', () => {
    expect(ids(deadEnds(single([choice('a')])))).toEqual(['dead-end:c1:a'])
    expect(ids(deadEnds(single([choice('a', [opt('o1'), opt('o2')])])))).toEqual(['dead-end:c1:a'])
  })
  it('flags a jump without target or link', () => {
    expect(ids(deadEnds(single([jump('a')])))).toEqual(['dead-end:c1:a'])
  })
  it('does not flag an End node, connected nodes, links or a dangling target', () => {
    const nodes = [
      lines('a', 'b'),
      choice('b', [opt('o1', 'c'), opt('o2', null, { link: { itemId: 'c2' } })]),
      jump('c', null, { link: { itemId: 'c2' } }),
      jump('d', 'gone'),
      end('e'),
    ]
    expect(deadEnds(single(nodes))).toEqual([])
  })
  it('does not flag a choice with at least one connected option', () => {
    expect(deadEnds(single([choice('a', [opt('o1'), opt('o2', 'b')]), end('b')]))).toEqual([])
  })
  it('ids are stable across runs', () => {
    const i = single([lines('a'), jump('b')])
    expect(ids(deadEnds(i))).toEqual(ids(deadEnds(i)))
  })
  it('ignores trashed items and items without a loaded conversation', () => {
    const c = conv('c1', [lines('a')])
    expect(deadEnds(input([item('c1', 'conversation', { trashed: true })], [c]))).toEqual([])
    expect(deadEnds(input([item('c1')], []))).toEqual([])
    expect(deadEnds(input([item('s1', 'scene')], [c]))).toEqual([])
  })
})

describe('unreachableNodes', () => {
  it('flags a node nothing leads to', () => {
    const f = unreachableNodes(single([lines('a', 'b'), end('b'), end('x')]))
    expect(ids(f)).toEqual(['unreachable-node:c1:x'])
    expect(f[0]!.params).toEqual({ node: expect.any(String), item: 'T-c1' })
  })
  it('reaches everything in a connected graph, including a loop', () => {
    const nodes = [lines('a', 'b'), choice('b', [opt('o1', 'a'), opt('o2', 'c')]), end('c')]
    expect(unreachableNodes(single(nodes))).toEqual([])
  })
  it('flags every node of an unreachable cycle', () => {
    const nodes = [end('a'), lines('x', 'y'), lines('y', 'x')]
    expect(ids(unreachableNodes(single(nodes)))).toEqual(['unreachable-node:c1:x', 'unreachable-node:c1:y'])
  })
  it('follows jumps', () => {
    expect(unreachableNodes(single([jump('a', 'b'), end('b')]))).toEqual([])
  })
  it('counts a node that another conversation links into', () => {
    const c1 = conv('c1', [end('a'), end('x')])
    const c2 = conv('c2', [jump('j', null, { link: { itemId: 'c1', nodeId: 'x' } })])
    const f = unreachableNodes(input([item('c1'), item('c2')], [c1, c2]))
    expect(f).toEqual([])
  })
  it('ignores a link from a trashed conversation', () => {
    const c1 = conv('c1', [end('a'), end('x')])
    const c2 = conv('c2', [jump('j', null, { link: { itemId: 'c1', nodeId: 'x' } })])
    const f = unreachableNodes(input([item('c1'), item('c2', 'conversation', { trashed: true })], [c1, c2]))
    expect(ids(f)).toEqual(['unreachable-node:c1:x'])
  })
  it('skips a conversation without a start node', () => {
    expect(unreachableNodes(single([end('a')], null))).toEqual([])
  })
  it('ignores trashed items', () => {
    const c = conv('c1', [end('a'), end('x')])
    expect(unreachableNodes(input([item('c1', 'conversation', { trashed: true })], [c]))).toEqual([])
  })
})

describe('choiceNoTarget', () => {
  it('flags an option with neither target nor link, with the option in the id', () => {
    const f = choiceNoTarget(single([choice('a', [opt('o1', 'b'), opt('o2')]), end('b')]))
    expect(ids(f)).toEqual(['choice-no-target:c1:a:o2'])
    expect(f[0]!.severity).toBe('error')
    expect(f[0]!.params).toEqual({ node: expect.any(String), item: 'T-c1' })
    expect(f[0]!.locations).toEqual([{ kind: 'item', id: 'c1', nodeId: 'a', label: 'T-c1' }])
  })
  it('does not flag options with a target, a dangling target or a link', () => {
    const nodes = [
      choice('a', [opt('o1', 'b'), opt('o2', 'gone'), opt('o3', null, { link: { itemId: 'c2' } })]),
      end('b'),
    ]
    expect(choiceNoTarget(single(nodes))).toEqual([])
  })
  it('ignores trashed items', () => {
    const c = conv('c1', [choice('a', [opt('o1')])])
    expect(choiceNoTarget(input([item('c1', 'conversation', { trashed: true })], [c]))).toEqual([])
  })
})

describe('undefinedVariables', () => {
  const v: Variable = { id: 'v1', name: 'Met', type: 'flag', default: false }
  const term = (variableId: string) => ({ variableId, op: 'isTrue' })
  const withVars = (nodes: N[], variables: Variable[]) =>
    input([item('c1')], [conv('c1', nodes)], { variables })

  it('flags a condition term on a deleted variable', () => {
    const nodes = [lines('a', null, { condition: { mode: 'all', terms: [term('gone')] } })]
    const f = undefinedVariables(withVars(nodes, [v]))
    expect(ids(f)).toEqual(['undefined-variable:c1:a:gone'])
    expect(f[0]!.severity).toBe('error')
    expect(f[0]!.params).toEqual({ item: 'T-c1', variable: 'gone' })
  })
  it('flags a set on a deleted variable, including an option set', () => {
    const nodes = [
      lines('a', null, { sets: [{ variableId: 'gone', op: 'set', value: true }] }),
      choice('b', [opt('o1', null, { sets: [{ variableId: 'gone', op: 'set', value: true }] })]),
    ]
    expect(ids(undefinedVariables(withVars(nodes, [])))).toEqual([
      'undefined-variable:c1:a:gone',
      'undefined-variable:c1:b:o1:gone',
    ])
  })
  it('reports one finding when condition and set use the same missing variable', () => {
    const nodes = [
      lines('a', null, {
        condition: { mode: 'all', terms: [term('gone')] },
        sets: [{ variableId: 'gone', op: 'set', value: true }],
      }),
    ]
    expect(undefinedVariables(withVars(nodes, []))).toHaveLength(1)
  })
  it('does not flag known variables or a type mismatch', () => {
    const nodes = [
      lines('a', null, {
        condition: { mode: 'all', terms: [term('v1'), { variableId: 'v1', op: 'gt', value: 3 }] },
      }),
    ]
    expect(undefinedVariables(withVars(nodes, [v]))).toEqual([])
  })
  it('ids are stable across runs and trashed items are ignored', () => {
    const nodes = [lines('a', null, { sets: [{ variableId: 'gone', op: 'set', value: true }] })]
    const i = withVars(nodes, [])
    expect(ids(undefinedVariables(i))).toEqual(ids(undefinedVariables(i)))
    const t = input([item('c1', 'conversation', { trashed: true })], [conv('c1', nodes)])
    expect(undefinedVariables(t)).toEqual([])
  })
})

describe('unreachableItems', () => {
  const two = [item('c1'), item('c2')]
  const convs = (...links: [string, string][]) =>
    [...new Set(['c1', 'c2', 'c3', ...links.map((l) => l[0])])].map((id) => {
      const l = links.find((x) => x[0] === id)
      return conv(id, [l ? jump('j', null, { link: { itemId: l[1] } }) : end('e')])
    })

  it('flags an item no arrow reaches from the Start box', () => {
    const m = map([box('b1', 'c1', true), box('b2', 'c2')])
    const f = unreachableItems(input(two, convs(), { map: m }))
    expect(ids(f)).toEqual(['unreachable-item:c2'])
    expect(f[0]!.severity).toBe('warning')
    expect(f[0]!.params).toEqual({ item: 'T-c2' })
    expect(f[0]!.locations).toEqual([{ kind: 'item', id: 'c2', label: 'T-c2' }])
  })
  it('follows manual arrows, also through a beat', () => {
    const m = map([box('b1', 'c1', true), beat('t'), box('b2', 'c2')], [arrow('b1', 't'), arrow('t', 'b2')])
    expect(unreachableItems(input(two, convs(), { map: m }))).toEqual([])
  })
  it('follows a cross-link in a conversation', () => {
    const m = map([box('b1', 'c1', true), box('b2', 'c2')])
    expect(unreachableItems(input(two, convs(['c1', 'c2']), { map: m }))).toEqual([])
  })
  it('reaches an item that is linked but has no box', () => {
    const m = map([box('b1', 'c1', true)])
    expect(unreachableItems(input(two, convs(['c1', 'c2']), { map: m }))).toEqual([])
  })
  it('flags an item with no box that nothing links to', () => {
    const m = map([box('b1', 'c1', true)])
    expect(ids(unreachableItems(input(two, convs(), { map: m })))).toEqual(['unreachable-item:c2'])
  })
  it('flags scripts too', () => {
    const m = map([box('b1', 'c1', true)])
    const f = unreachableItems(input([item('c1'), item('s1', 'scene')], convs(), { map: m }))
    expect(ids(f)).toEqual(['unreachable-item:s1'])
  })
  it('treats the first box as the start when none is marked', () => {
    const m = map([box('b1', 'c1'), box('b2', 'c2'), box('b3', 'c3')], [arrow('b1', 'b2')])
    const f = unreachableItems(input([...two, item('c3')], convs(), { map: m }))
    expect(ids(f)).toEqual(['unreachable-item:c3'])
  })
  it('flags nothing when the map has no boxes', () => {
    expect(unreachableItems(input(two, convs()))).toEqual([])
  })
  it('ignores trashed items and does not pass through them', () => {
    const m = map([box('b1', 'c1', true), box('b2', 'c2'), box('b3', 'c3')], [arrow('b1', 'b2'), arrow('b2', 'b3')])
    const items = [item('c1'), item('c2', 'conversation', { trashed: true }), item('c3')]
    expect(ids(unreachableItems(input(items, convs(), { map: m })))).toEqual(['unreachable-item:c3'])
  })
  it('does not report broken link targets', () => {
    const m = map([box('b1', 'c1', true)])
    const f = unreachableItems(input([item('c1')], convs(['c1', 'missing']), { map: m }))
    expect(f).toEqual([])
  })
  it('ids are stable across runs', () => {
    const i = input(two, convs(), { map: map([box('b1', 'c1', true), box('b2', 'c2')]) })
    expect(ids(unreachableItems(i))).toEqual(ids(unreachableItems(i)))
  })
})

describe('routeUnreachable', () => {
  const R1: RouteRef = { timelineId: 't', branchId: 'r1' }
  const R2: RouteRef = { timelineId: 't', branchId: 'r2' }
  const routes = [
    { ref: R1, name: 'Hero', timelineName: 'Main' },
    { ref: R2, name: 'Villain', timelineName: 'Main' },
  ]
  const chain = (...its: GameCheckItem[]) =>
    input(its, [], {
      routes,
      map: map(
        its.map((it, i) => box(`b${i}`, it.id, i === 0)),
        its.slice(1).map((_, i) => arrow(`b${i}`, `b${i + 1}`)),
      ),
    })

  it('flags an item whose only path crosses an item of another route', () => {
    const f = routeUnreachable(
      chain(item('a'), item('b', 'conversation', { routes: [R2] }), item('c', 'conversation', { routes: [R1] })),
    )
    expect(ids(f)).toEqual(['route-unreachable:c'])
    expect(f[0]!.severity).toBe('warning')
    expect(f[0]!.params).toEqual({ route: 'Hero' })
    expect(f[0]!.locations).toEqual([{ kind: 'item', id: 'c', label: 'T-c' }])
  })
  it('passes through untagged items and items of the same route', () => {
    const f = routeUnreachable(
      chain(item('a'), item('b', 'conversation', { routes: [R1, R2] }), item('c', 'conversation', { routes: [R1] })),
    )
    expect(f).toEqual([])
    expect(routeUnreachable(chain(item('a'), item('b'), item('c', 'conversation', { routes: [R1] })))).toEqual([])
  })
  it('flags a tagged start item of another route', () => {
    const f = routeUnreachable(chain(item('a', 'conversation', { routes: [R2] }), item('c', 'conversation', { routes: [R1] })))
    expect(ids(f)).toEqual(['route-unreachable:c'])
  })
  it('names only the failing routes of an item', () => {
    const i = chain(item('a', 'conversation', { routes: [R1] }), item('c', 'conversation', { routes: [R1, R2] }))
    const f = routeUnreachable(i)
    expect(ids(f)).toEqual(['route-unreachable:c'])
    expect(f[0]!.params).toEqual({ route: 'Villain' })
  })
  it('finds another path around a blocking item', () => {
    const its = [item('a'), item('b', 'conversation', { routes: [R2] }), item('c', 'conversation', { routes: [R1] })]
    const m = map(
      [box('b0', 'a', true), box('b1', 'b'), box('b2', 'c')],
      [arrow('b0', 'b1'), arrow('b1', 'b2'), arrow('b0', 'b2')],
    )
    expect(routeUnreachable(input(its, [], { routes, map: m }))).toEqual([])
  })
  it('follows cross-links', () => {
    const its = [item('a'), item('c', 'conversation', { routes: [R1] })]
    const a = conv('a', [jump('j', null, { link: { itemId: 'c' } })])
    const i = input(its, [a], { routes, map: map([box('b0', 'a', true)]) })
    expect(routeUnreachable(i)).toEqual([])
  })
  it('does not flag a tag whose branch no longer exists', () => {
    const gone: RouteRef = { timelineId: 't', branchId: 'deleted' }
    const f = routeUnreachable(chain(item('a'), item('b', 'conversation', { routes: [gone] })))
    expect(f).toEqual([])
  })
  it('does not flag an item that unreachable-item already covers', () => {
    const its = [item('a'), item('c', 'conversation', { routes: [R1] })]
    const i = input(its, [], { routes, map: map([box('b0', 'a', true), box('b1', 'c')]) })
    expect(routeUnreachable(i)).toEqual([])
    expect(ids(unreachableItems(i))).toEqual(['unreachable-item:c'])
  })
  it('ignores trashed items and an empty map', () => {
    const i = chain(item('a'), item('b', 'conversation', { routes: [R2] }), item('c', 'conversation', { routes: [R1], trashed: true }))
    expect(routeUnreachable(i)).toEqual([])
    expect(routeUnreachable(input([item('c', 'conversation', { routes: [R1] })], [], { routes }))).toEqual([])
  })
  it('ids are stable across runs', () => {
    const i = chain(item('a'), item('b', 'conversation', { routes: [R2] }), item('c', 'conversation', { routes: [R1] }))
    expect(ids(routeUnreachable(i))).toEqual(ids(routeUnreachable(i)))
  })
})

describe('brokenSpeakers', () => {
  const base = (speakerIds: [string, string[]][], codex: string[]) => ({
    items: [item('c1'), item('s1', 'scene')],
    speakerIds: new Map(speakerIds),
    codexIds: new Set(codex),
  })
  it('flags a speaker that is not a live codex entry, once per item and speaker', () => {
    const f = brokenSpeakers(base([['c1', ['gone', 'gone', 'e1']], ['s1', ['gone']]], ['e1']))
    expect(ids(f)).toEqual(['broken-speaker:c1:gone', 'broken-speaker:s1:gone'])
    expect(f[0]!.severity).toBe('error')
    expect(f[0]!.params).toEqual({ item: 'T-c1' })
    expect(f[0]!.locations).toEqual([{ kind: 'item', id: 'c1', label: 'T-c1' }])
  })
  it('does not flag live speakers, and ignores trashed items', () => {
    expect(brokenSpeakers(base([['c1', ['e1']]], ['e1']))).toEqual([])
    const t = { ...base([['c1', ['gone']]], []), items: [item('c1', 'conversation', { trashed: true })] }
    expect(brokenSpeakers(t)).toEqual([])
  })
  it('ids are stable across runs', () => {
    const i = base([['c1', ['gone']]], [])
    expect(ids(brokenSpeakers(i))).toEqual(ids(brokenSpeakers(i)))
  })
})

describe('speakerIdsOf', () => {
  it('collects speaker ids from the lines of a conversation', () => {
    const line = (lineId: string, speakerId: string | null) => ({
      type: 'line',
      attrs: { id: `b${lineId}`, lineId, kind: 'speech', speakerId, speakerName: null },
      content: [],
    })
    const c = conv('c1', [
      lines('a', 'b', { content: { type: 'doc', content: [line('L000001', 'e1'), line('L000002', null)] } }),
      lines('b', null, { content: { type: 'doc', content: [line('L000003', 'e2'), line('L000004', 'e1')] } }),
    ])
    expect(speakerIdsOf(c).sort()).toEqual(['e1', 'e2'])
  })
})
