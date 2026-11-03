import { describe, expect, it } from 'vitest'
import { addNode, addOption } from '../game/conversationGraph'
import { setJumpLink, setOptionLink } from '../game/crossLinks'
import { conversationSchema, type Conversation } from '../project/schemas/conversation'
import { storyMapSchema, type StoryMap } from '../project/schemas/storyMap'
import {
  addBeat,
  connect,
  derivedArrows,
  disconnect,
  emptyStoryMap,
  moveBox,
  removeBox,
  setArrowCondition,
  setBeatText,
  setStart,
  startBoxes,
  syncItems,
} from './ops'

const synced = (ids: string[], m: StoryMap = emptyStoryMap()) =>
  syncItems(m, ids, (n => () => `b${++n}`)(m.boxes.length))
const boxOf = (m: StoryMap, itemId: string) =>
  m.boxes.find((b) => b.kind === 'item' && b.itemId === itemId)!

describe('syncItems', () => {
  it('adds a box per item, none overlapping, and the result validates', () => {
    const m = synced(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
    expect(m.boxes).toHaveLength(6)
    expect(new Set(m.boxes.map((b) => `${b.x},${b.y}`)).size).toBe(6)
    expect(storyMapSchema.safeParse(m).success).toBe(true)
  })

  it('adds only items without a box and keeps existing boxes and positions', () => {
    let m = synced(['c1'])
    m = moveBox(m, boxOf(m, 'c1').id, 500, 300)
    const again = synced(['c1', 'c2'], m)
    expect(again.boxes).toHaveLength(2)
    expect(boxOf(again, 'c1')).toMatchObject({ x: 500, y: 300 })
  })

  it('never removes a box, even when the item is gone from the list', () => {
    const m = synced(['c1', 'c2'])
    expect(synced(['c1'], m).boxes).toHaveLength(2)
  })

  it('returns the same map when nothing is new', () => {
    const m = synced(['c1'])
    expect(synced(['c1'], m)).toBe(m)
  })
})

describe('beats and boxes', () => {
  it('addBeat, setBeatText and moveBox', () => {
    let m = addBeat(emptyStoryMap(), { id: 'bt', text: 'Storm', x: 5, y: 6 })
    m = setBeatText(m, 'bt', 'Big storm')
    m = moveBox(m, 'bt', 50, 60)
    expect(m.boxes[0]).toMatchObject({ kind: 'beat', text: 'Big storm', x: 50, y: 60, start: false })
  })

  it('a duplicate beat id is refused; setBeatText on an item box does nothing', () => {
    const m = addBeat(emptyStoryMap(), { id: 'bt', text: 'a', x: 0, y: 0 })
    expect(addBeat(m, { id: 'bt', text: 'b', x: 0, y: 0 })).toBe(m)
    const withItem = synced(['c1'], m)
    expect(setBeatText(withItem, boxOf(withItem, 'c1').id, 'x')).toEqual(withItem)
  })

  it('removeBox drops the box and every arrow touching it', () => {
    let m = synced(['c1', 'c2', 'c3'])
    const [a, b, c] = m.boxes.map((x) => x.id)
    m = connect(m, 'a1', a, b)
    m = connect(m, 'a2', b, c)
    m = connect(m, 'a3', a, c)
    m = removeBox(m, b)
    expect(m.boxes.map((x) => x.id)).toEqual([a, c])
    expect(m.arrows.map((x) => x.id)).toEqual(['a3'])
  })
})

describe('arrows', () => {
  const two = () => synced(['c1', 'c2'])
  const [x, y] = ['b1', 'b2']

  it('connect adds an arrow; a loop is allowed; a duplicate pair or missing box is refused', () => {
    let m = connect(two(), 'a1', x, y)
    expect(m.arrows).toEqual([{ id: 'a1', from: x, to: y }])
    expect(connect(m, 'a2', x, y)).toBe(m)
    expect(connect(m, 'a3', x, 'nope')).toBe(m)
    m = connect(m, 'a4', y, x)
    m = connect(m, 'a5', x, x)
    expect(m.arrows).toHaveLength(3)
    expect(storyMapSchema.safeParse(m).success).toBe(true)
  })

  it('a reused arrow id is refused', () => {
    const m = connect(two(), 'a1', x, y)
    expect(connect(m, 'a1', y, x)).toBe(m)
  })

  it('disconnect removes by id; setArrowCondition sets and clears', () => {
    let m = connect(two(), 'a1', x, y)
    const cond = { mode: 'all' as const, terms: [{ variableId: 'v', op: 'isTrue' as const }] }
    m = setArrowCondition(m, 'a1', cond)
    expect(m.arrows[0].condition).toEqual(cond)
    m = setArrowCondition(m, 'a1', undefined)
    expect('condition' in m.arrows[0]).toBe(false)
    expect(disconnect(m, 'a1').arrows).toEqual([])
    expect(disconnect(m, 'zz')).toBe(m)
  })
})

describe('starts', () => {
  it('setStart marks several boxes; startBoxes lists them', () => {
    let m = synced(['c1', 'c2', 'c3'])
    m = setStart(m, 'b2', true)
    m = setStart(m, 'b3', true)
    expect(startBoxes(m)).toEqual({ ids: ['b2', 'b3'], implicit: false })
    m = setStart(m, 'b2', false)
    expect(startBoxes(m).ids).toEqual(['b3'])
  })

  it('with none marked, the first box is the start and implicit is true', () => {
    expect(startBoxes(synced(['c1', 'c2']))).toEqual({ ids: ['b1'], implicit: true })
  })

  it('an empty map has no start', () => {
    expect(startBoxes(emptyStoryMap())).toEqual({ ids: [], implicit: true })
  })
})

describe('derivedArrows', () => {
  const conv = (id: string, build: (c: Conversation) => Conversation): Conversation =>
    build(conversationSchema.parse({ version: 3, id, title: id, startNodeId: null, nodes: [] }))

  const withLinks = conv('c1', (c0) => {
    let c = addNode(c0, 'jump', { id: 'j', x: 0, y: 0 })
    c = addNode(c, 'choice', { id: 'ch', x: 300, y: 0 })
    c = addOption(c, 'ch', { id: 'o1', text: 'Go east' })
    c = addOption(c, 'ch', { id: 'o2', text: 'Go west' })
    c = setJumpLink(c, 'j', { itemId: 'c2' })
    c = setOptionLink(c, 'ch', 'o1', { itemId: 'c2', nodeId: 'x' })
    return setOptionLink(c, 'ch', 'o2', { itemId: 's1' })
  })

  it('one arrow per (from, to) pair of boxes, with every source listed', () => {
    const m = synced(['c1', 'c2', 's1'])
    const arrows = derivedArrows(m, [{ id: 'c1', conversation: withLinks }])
    expect(arrows).toHaveLength(2)
    const toC2 = arrows.find((a) => a.to === boxOf(m, 'c2').id)!
    expect(toC2.from).toBe(boxOf(m, 'c1').id)
    expect(toC2.sources).toEqual([
      { nodeId: 'j', text: undefined },
      { nodeId: 'ch', optionId: 'o1', text: 'Go east' },
    ])
  })

  it('ids are stable across runs and independent of order of items', () => {
    const m = synced(['c1', 'c2', 's1'])
    const a = derivedArrows(m, [{ id: 'c1', conversation: withLinks }]).map((x) => x.id)
    const b = derivedArrows(m, [{ id: 'c1', conversation: withLinks }]).map((x) => x.id)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
  })

  it('carries the option condition of a single source', () => {
    const cond = { mode: 'all' as const, terms: [{ variableId: 'v', op: 'isTrue' as const }] }
    const c = conv('c1', (c0) => {
      let x = addNode(c0, 'choice', { id: 'ch', x: 0, y: 0 })
      x = addOption(x, 'ch', { id: 'o1', text: 'Go' })
      x = setOptionLink(x, 'ch', 'o1', { itemId: 'c2' })
      return {
        ...x,
        nodes: x.nodes.map((n) =>
          n.type === 'choice' ? { ...n, options: n.options.map((o) => ({ ...o, condition: cond })) } : n,
        ),
      }
    })
    const m = synced(['c1', 'c2'])
    expect(derivedArrows(m, [{ id: 'c1', conversation: c }])[0].sources[0].condition).toEqual(cond)
  })

  it('skips links whose target item has no box, and conversations without a box', () => {
    const m = synced(['c1'])
    expect(derivedArrows(m, [{ id: 'c1', conversation: withLinks }])).toEqual([])
    expect(derivedArrows(synced(['c2']), [{ id: 'c1', conversation: withLinks }])).toEqual([])
  })

  it('a link to a trashed item still draws (the box stays)', () => {
    const m = synced(['c1', 'c2', 's1'])
    expect(derivedArrows(m, [{ id: 'c1', conversation: withLinks }])).toHaveLength(2)
  })
})
