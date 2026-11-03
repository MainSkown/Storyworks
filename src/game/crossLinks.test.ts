import { describe, expect, it } from 'vitest'
import { addNode, addOption, connect, disconnect, toGraph, updateOption } from './conversationGraph'
import {
  linkProblems,
  linksOf,
  resolveLink,
  setJumpLink,
  setOptionLink,
  type LinkContext,
} from './crossLinks'
import { conversationSchema, type Conversation } from '../project/schemas/conversation'

const base = (): Conversation => {
  let c = conversationSchema.parse({ version: 3, id: 'c1', title: 'T', startNodeId: null, nodes: [] })
  c = addNode(c, 'jump', { id: 'j', x: 0, y: 0 })
  c = addNode(c, 'choice', { id: 'ch', x: 300, y: 0 })
  c = addNode(c, 'end', { id: 'e', x: 600, y: 0 })
  return addOption(c, 'ch', { id: 'o1', text: 'Go' })
}
const node = (c: Conversation, id: string) => c.nodes.find((n) => n.id === id)!

const ctx = (over: Partial<Record<string, { type: 'scene' | 'conversation'; trashed: boolean; nodes?: string[] }>> = {}): LinkContext => {
  const items = {
    c2: { type: 'conversation' as const, trashed: false, nodes: ['x', 'y'] },
    s1: { type: 'scene' as const, trashed: false },
    ...over,
  }
  return {
    item: (id) => items[id as keyof typeof items] ?? null,
    nodeIds: (id) => {
      const n = (items[id as keyof typeof items] as { nodes?: string[] } | undefined)?.nodes
      return n ? new Set(n) : null
    },
  }
}

describe('resolveLink', () => {
  it('a live conversation, with and without a node, resolves', () => {
    expect(resolveLink({ itemId: 'c2' }, ctx())).toEqual({ ok: true })
    expect(resolveLink({ itemId: 'c2', nodeId: 'x' }, ctx())).toEqual({ ok: true })
  })

  it('a script resolves, and its node id is ignored', () => {
    expect(resolveLink({ itemId: 's1', nodeId: 'whatever' }, ctx())).toEqual({ ok: true })
  })

  it('an unknown item is broken (missing)', () => {
    expect(resolveLink({ itemId: 'nope' }, ctx())).toEqual({ ok: false, reason: 'item-missing' })
  })

  it('a trashed item is broken, and live again after restore', () => {
    const trashed = ctx({ c2: { type: 'conversation', trashed: true, nodes: ['x'] } })
    expect(resolveLink({ itemId: 'c2' }, trashed)).toEqual({ ok: false, reason: 'item-trashed' })
    expect(resolveLink({ itemId: 'c2' }, ctx())).toEqual({ ok: true })
  })

  it('a node missing in the target conversation is broken; an unloaded conversation is not judged', () => {
    expect(resolveLink({ itemId: 'c2', nodeId: 'zzz' }, ctx())).toEqual({ ok: false, reason: 'node-missing' })
    const unloaded = ctx({ c2: { type: 'conversation', trashed: false } })
    expect(resolveLink({ itemId: 'c2', nodeId: 'zzz' }, unloaded)).toEqual({ ok: true })
  })
})

describe('setting links', () => {
  it('setJumpLink sets the link and clears the node target', () => {
    let c = connect(base(), 'j', 'e')
    c = setJumpLink(c, 'j', { itemId: 'c2', nodeId: 'x' })
    expect(node(c, 'j')).toMatchObject({ target: null, link: { itemId: 'c2', nodeId: 'x' } })
    expect(toGraph(c).edges).toHaveLength(0)
  })

  it('setOptionLink sets the link, clears the target, and null removes it', () => {
    let c = connect(base(), 'ch', 'e', { optionId: 'o1' })
    c = setOptionLink(c, 'ch', 'o1', { itemId: 's1' })
    const o = () => (node(c, 'ch') as Extract<ReturnType<typeof node>, { type: 'choice' }>).options[0]
    expect(o()).toMatchObject({ target: null, link: { itemId: 's1' } })
    c = setOptionLink(c, 'ch', 'o1', null)
    expect('link' in o()).toBe(false)
  })

  it('connecting to a node removes an existing link', () => {
    let c = setJumpLink(base(), 'j', { itemId: 'c2' })
    c = connect(c, 'j', 'e')
    expect('link' in node(c, 'j')).toBe(false)
    expect(node(c, 'j')).toMatchObject({ target: { nodeId: 'e' } })
    c = setOptionLink(c, 'ch', 'o1', { itemId: 'c2' })
    c = connect(c, 'ch', 'e', { optionId: 'o1' })
    expect(JSON.stringify(node(c, 'ch'))).not.toContain('"link"')
  })

  it('retargeting an option through updateOption removes its link; clearing the target keeps it', () => {
    let c = setOptionLink(base(), 'ch', 'o1', { itemId: 'c2' })
    c = updateOption(c, 'ch', 'o1', { text: 'Other' })
    expect(JSON.stringify(node(c, 'ch'))).toContain('"link"')
    c = updateOption(c, 'ch', 'o1', { target: 'e' })
    expect(JSON.stringify(node(c, 'ch'))).not.toContain('"link"')
  })

  it('disconnecting a link edge id removes the link', () => {
    const c = setJumpLink(base(), 'j', { itemId: 'c2' })
    expect(JSON.stringify(node(disconnect(c, 'jump:j'), 'j'))).not.toContain('"link"')
  })

  it('an unknown node or option leaves the conversation unchanged', () => {
    const c = base()
    expect(setJumpLink(c, 'nope', { itemId: 'c2' })).toBe(c)
    expect(setOptionLink(c, 'ch', 'nope', { itemId: 'c2' })).toBe(c)
    expect(setJumpLink(c, 'e', { itemId: 'c2' })).toBe(c)
  })

  it('the result stays a valid conversation', () => {
    const c = setOptionLink(setJumpLink(base(), 'j', { itemId: 'c2' }), 'ch', 'o1', { itemId: 's1', nodeId: 'q' })
    expect(conversationSchema.safeParse(JSON.parse(JSON.stringify(c))).success).toBe(true)
  })
})

describe('linksOf and linkProblems', () => {
  const linked = () => setOptionLink(setJumpLink(base(), 'j', { itemId: 'c2', nodeId: 'x' }), 'ch', 'o1', { itemId: 's1' })

  it('lists every link with its source node and option', () => {
    expect(linksOf(linked())).toEqual([
      { nodeId: 'j', link: { itemId: 'c2', nodeId: 'x' } },
      { nodeId: 'ch', optionId: 'o1', link: { itemId: 's1' } },
    ])
  })

  it('a conversation without links has none', () => {
    expect(linksOf(base())).toEqual([])
  })

  it('reports only the broken links, each with its reason', () => {
    const c = ctx({ s1: { type: 'scene', trashed: true } })
    expect(linkProblems(linked(), c)).toEqual([
      { nodeId: 'ch', optionId: 'o1', link: { itemId: 's1' }, reason: 'item-trashed' },
    ])
    expect(linkProblems(linked(), ctx())).toEqual([])
  })
})
