import { describe, expect, it } from 'vitest'
import { addNode, addOption } from './conversationGraph'
import { setJumpLink, setOptionLink } from './crossLinks'
import { inboundLinks } from './inboundLinks'
import { conversationSchema, type Conversation } from '../project/schemas/conversation'

const conv = (id: string): Conversation => {
  let c = conversationSchema.parse({ version: 3, id, title: id, startNodeId: null, nodes: [] })
  c = addNode(c, 'jump', { id: `${id}-j`, x: 0, y: 0 })
  c = addNode(c, 'choice', { id: `${id}-ch`, x: 300, y: 0 })
  return addOption(c, `${id}-ch`, { id: `${id}-o`, text: 'Go' })
}

describe('inboundLinks', () => {
  it('counts jump and option links from other conversations', () => {
    let a = setJumpLink(conv('a'), 'a-j', { itemId: 'x' })
    a = setOptionLink(a, 'a-ch', 'a-o', { itemId: 'x', nodeId: 'n' })
    const b = setJumpLink(conv('b'), 'b-j', { itemId: 'y' })
    expect(inboundLinks([a, b], ['x'])).toBe(2)
    expect(inboundLinks([a, b], ['x', 'y'])).toBe(3)
  })

  it('ignores links from the deleted items themselves', () => {
    const a = setJumpLink(conv('a'), 'a-j', { itemId: 'x' })
    expect(inboundLinks([a], ['x', 'a'])).toBe(0)
  })

  it('is zero when nothing links to the item', () => {
    expect(inboundLinks([conv('a')], ['x'])).toBe(0)
  })
})
