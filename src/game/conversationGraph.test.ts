import { describe, expect, it } from 'vitest'
import {
  addNode,
  addOption,
  brokenTargets,
  canConnect,
  connect,
  deleteNode,
  disconnect,
  moveOption,
  placeNew,
  removeOption,
  setStart,
  toGraph,
  updateOption,
} from './conversationGraph'
import { conversationSchema, type Conversation } from '../project/schemas/conversation'

const empty = (): Conversation =>
  conversationSchema.parse({ version: 3, id: 'c', title: 'T', startNodeId: null, nodes: [] })

const at = (x = 0, y = 0) => ({ x, y })
const build = (): Conversation => {
  let c = empty()
  c = addNode(c, 'lines', { id: 'a', ...at() })
  c = addNode(c, 'choice', { id: 'b', ...at(220) })
  c = addNode(c, 'end', { id: 'e', ...at(440) })
  return c
}
const node = (c: Conversation, id: string) => c.nodes.find((n) => n.id === id)!
const valid = (c: Conversation) => conversationSchema.parse(c)

describe('toGraph', () => {
  it('builds edges from next, jump and options with stable ids', () => {
    let c = build()
    c = addNode(c, 'jump', { id: 'j', ...at(0, 100) })
    c = connect(c, 'a', 'b')
    c = connect(c, 'j', 'e')
    c = connect(c, 'b', 'e', { newOptionId: 'o1' })
    c = updateOption(c, 'b', 'o1', { text: 'Go' })
    const g = toGraph(c)
    expect(g.nodes.map((n) => [n.id, n.label])).toEqual([
      ['a', 'lines'],
      ['b', 'choice'],
      ['e', 'end'],
      ['j', 'jump'],
    ])
    expect(g.edges).toEqual([
      { id: 'next:a', from: 'a', to: 'b' },
      { id: 'opt:o1', from: 'b', to: 'e', label: 'Go' },
      { id: 'jump:j', from: 'j', to: 'e' },
    ])
    expect(toGraph(c)).toEqual(g)
  })

  it('skips null targets', () => {
    const c = addOption(build(), 'b', { id: 'o1' })
    expect(toGraph(c).edges).toEqual([])
  })
})

describe('brokenTargets', () => {
  it('reports a missing target and draws no edge', () => {
    let c = build()
    c = connect(c, 'a', 'e')
    c = { ...c, nodes: c.nodes.map((n) => (n.id === 'a' ? { ...n, next: 'gone' } : n)) }
    c = addOption(c, 'b', { id: 'o1', target: 'nope' })
    expect(toGraph(c).edges).toEqual([])
    expect(brokenTargets(c)).toEqual([
      { nodeId: 'a', targetId: 'gone' },
      { nodeId: 'b', optionId: 'o1', targetId: 'nope' },
    ])
  })

  it('reports nothing for a sound graph', () => {
    expect(brokenTargets(connect(build(), 'a', 'b'))).toEqual([])
  })
})

describe('addNode and placeNew', () => {
  it('the first node becomes the start, later ones do not', () => {
    const c = build()
    expect(c.startNodeId).toBe('a')
    expect(node(c, 'a')).toMatchObject({ type: 'lines', content: { type: 'doc', content: [] }, next: null })
    expect(node(c, 'b')).toMatchObject({ type: 'choice', options: [] })
  })

  it('afterId links an empty lines node to the new one', () => {
    const c = addNode(build(), 'lines', { id: 'n', ...at(), afterId: 'a' })
    expect(node(c, 'a')).toMatchObject({ next: 'n' })
  })

  it('places right of the focused node when that spot is free', () => {
    const c = addNode(build(), 'end', { id: 'low', ...at(0, 300) })
    expect(placeNew(c, 'e')).toEqual({ x: 840, y: 0 })
    expect(placeNew(c, 'low')).toEqual({ x: 400, y: 300 })
  })

  it('steps down when the spot right of the focused node is taken', () => {
    let c = build()
    expect(placeNew(c, 'a')).toEqual({ x: 400, y: 120 })
    c = addNode(c, 'end', { id: 'n1', ...at(400, 120) })
    expect(placeNew(c, 'a')).toEqual({ x: 400, y: 240 })
  })

  it('counts a node that only partly overlaps the spot as taking it', () => {
    const c = addNode(build(), 'end', { id: 'n1', ...at(300, 100) })
    expect(placeNew(c, 'a')).toEqual({ x: 400, y: 240 })
  })

  it('with no focus uses the first free spot below the lowest node', () => {
    const c = addNode(build(), 'end', { id: 'low', ...at(0, 300) })
    expect(placeNew(c, null)).toEqual({ x: 0, y: 420 })
    expect(placeNew(empty(), null)).toEqual({ x: 0, y: 0 })
  })

  it('treats an unknown focus id like no focus', () => {
    expect(placeNew(build(), 'gone')).toEqual({ x: 0, y: 120 })
  })
})

describe('deleteNode', () => {
  it('clears inbound references but keeps options', () => {
    let c = build()
    c = addNode(c, 'jump', { id: 'j', ...at() })
    c = connect(c, 'a', 'e')
    c = connect(c, 'j', 'e')
    c = connect(c, 'b', 'e', { newOptionId: 'o1' })
    c = deleteNode(c, 'e')
    expect(node(c, 'a')).toMatchObject({ next: null })
    expect(node(c, 'j')).toMatchObject({ target: null })
    expect(node(c, 'b')).toMatchObject({ options: [{ id: 'o1', target: null }] })
    expect(brokenTargets(c)).toEqual([])
    valid(c)
  })

  it('moves the start to the first remaining node, or null', () => {
    let c = deleteNode(build(), 'a')
    expect(c.startNodeId).toBe('b')
    c = deleteNode(deleteNode(c, 'b'), 'e')
    expect(c.startNodeId).toBeNull()
  })

  it('keeps the start when another node goes', () => {
    expect(deleteNode(build(), 'e').startNodeId).toBe('a')
  })
})

describe('connect', () => {
  it('lines: a second connect replaces next', () => {
    const c = connect(connect(build(), 'a', 'b'), 'a', 'e')
    expect(node(c, 'a')).toMatchObject({ next: 'e' })
  })

  it('jump: a second connect replaces the target', () => {
    let c = addNode(build(), 'jump', { id: 'j', ...at() })
    c = connect(connect(c, 'j', 'a'), 'j', 'e')
    expect(node(c, 'j')).toMatchObject({ target: { nodeId: 'e' } })
  })

  it('choice: appends an option, or retargets a given one', () => {
    let c = connect(build(), 'b', 'e', { newOptionId: 'o1' })
    expect(node(c, 'b')).toMatchObject({ options: [{ id: 'o1', text: '', target: 'e' }] })
    c = connect(c, 'b', 'a', { optionId: 'o1' })
    expect(node(c, 'b')).toMatchObject({ options: [{ id: 'o1', target: 'a' }] })
  })

  it('choice without option ids is refused', () => {
    const c = build()
    expect(connect(c, 'b', 'e')).toEqual(c)
  })

  it('end is refused', () => {
    const c = build()
    expect(connect(c, 'e', 'a')).toEqual(c)
  })

  it('an unknown target is refused', () => {
    const c = build()
    expect(connect(c, 'a', 'zzz')).toEqual(c)
  })
})

describe('disconnect', () => {
  it('clears the field an edge id names, option stays', () => {
    let c = connect(build(), 'a', 'e')
    c = connect(c, 'b', 'e', { newOptionId: 'o1' })
    c = disconnect(disconnect(c, 'next:a'), 'opt:o1')
    expect(node(c, 'a')).toMatchObject({ next: null })
    expect(node(c, 'b')).toMatchObject({ options: [{ id: 'o1', target: null }] })
    expect(toGraph(c).edges).toEqual([])
  })

  it('clears a jump', () => {
    let c = addNode(build(), 'jump', { id: 'j', ...at() })
    c = disconnect(connect(c, 'j', 'a'), 'jump:j')
    expect(node(c, 'j')).toMatchObject({ target: null })
  })
})

describe('options', () => {
  const three = () => {
    let c = build()
    for (const id of ['o1', 'o2', 'o3']) c = addOption(c, 'b', { id, text: id })
    return c
  }
  const ids = (c: Conversation) =>
    (node(c, 'b') as Extract<Conversation['nodes'][number], { type: 'choice' }>).options.map((o) => o.id)

  it('moveOption reorders and keeps ids', () => {
    expect(ids(moveOption(three(), 'b', 'o3', 0))).toEqual(['o3', 'o1', 'o2'])
    expect(ids(moveOption(three(), 'b', 'o1', 99))).toEqual(['o2', 'o3', 'o1'])
  })

  it('removeOption drops only that option', () => {
    expect(ids(removeOption(three(), 'b', 'o2'))).toEqual(['o1', 'o3'])
  })

  it('updateOption sets text, condition and sets', () => {
    const cond = { mode: 'all' as const, terms: [{ variableId: 'v', op: 'isTrue' as const }] }
    const c = updateOption(three(), 'b', 'o1', {
      text: 'Hi',
      condition: cond,
      sets: [{ variableId: 'v', op: 'toggle' }],
    })
    expect(node(c, 'b')).toMatchObject({
      options: [{ id: 'o1', text: 'Hi', condition: cond, sets: [{ variableId: 'v', op: 'toggle' }] }, {}, {}],
    })
    valid(c)
  })

  it('a duplicate option id is refused', () => {
    const c = three()
    expect(addOption(c, 'b', { id: 'o1' })).toEqual(c)
  })
})

describe('setStart', () => {
  it('marks another node, ignores unknown ids', () => {
    expect(setStart(build(), 'e').startNodeId).toBe('e')
    expect(setStart(build(), 'zzz').startNodeId).toBe('a')
  })
})

describe('canConnect', () => {
  const can = canConnect(connect(build(), 'a', 'b'))
  it('refuses unknown nodes', () => {
    expect(can('a', 'zzz')).toMatchObject({ ok: false })
    expect(can('zzz', 'a')).toMatchObject({ ok: false })
  })
  it('refuses leaving End', () => {
    expect(can('e', 'a')).toEqual({ ok: false, reason: 'end-no-outgoing' })
  })
  it('allows loops and self-connection', () => {
    expect(can('a', 'a')).toEqual({ ok: true })
    expect(can('b', 'b')).toEqual({ ok: true })
  })
})

describe('cycles and purity', () => {
  it('allows A -> B -> A', () => {
    let c = addNode(build(), 'lines', { id: 'b2', ...at() })
    c = connect(connect(c, 'a', 'b2'), 'b2', 'a')
    expect(toGraph(c).edges.map((e) => e.id)).toEqual(['next:a', 'next:b2'])
    valid(c)
  })

  it('results validate and inputs are not mutated', () => {
    const c = build()
    const frozen = JSON.stringify(c)
    const out = [
      addNode(c, 'jump', { id: 'j', ...at() }),
      deleteNode(c, 'a'),
      connect(c, 'a', 'b'),
      connect(c, 'b', 'e', { newOptionId: 'o1' }),
      addOption(c, 'b', { id: 'o9' }),
      setStart(c, 'e'),
    ]
    out.forEach(valid)
    expect(JSON.stringify(c)).toBe(frozen)
  })
})
