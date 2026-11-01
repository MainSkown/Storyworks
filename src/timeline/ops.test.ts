import { describe, expect, it } from 'vitest'
import {
  addBranch,
  addNode,
  newTimeline,
  removeBranch,
  setPositions,
  setView,
  updateBranch,
  updateNode,
} from './ops'
import type { Timeline } from './schema'
import { timelineSchema } from './schema'

const ok = <T>(r: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(`rejected: ${r.reason}`)
  return r.value
}

describe('timeline ops', () => {
  it('a new timeline is valid and empty', () => {
    const t = newTimeline('t1', 'Main')
    expect(timelineSchema.safeParse(t).success).toBe(true)
    expect(t.nodes).toEqual([])
  })

  it('addNode places the node right of the one it follows and can connect it', () => {
    let t = ok(addNode(newTimeline('t1', 'Main'), { id: 'a' }))
    t = ok(addNode(t, { id: 'b', afterId: 'a', edgeId: 'e1' }))
    const [a, b] = t.nodes
    expect(b.pos.x).toBeGreaterThan(a.pos.x)
    expect(t.edges).toEqual([{ id: 'e1', from: 'a', to: 'b' }])
    expect(timelineSchema.safeParse(t).success).toBe(true)
  })

  it('a second child of the same node does not land on the first', () => {
    let t = ok(addNode(newTimeline('t1', 'Main'), { id: 'a' }))
    t = ok(addNode(t, { id: 'b', afterId: 'a' }))
    t = ok(addNode(t, { id: 'c', afterId: 'a' }))
    expect(t.nodes[1].pos).not.toEqual(t.nodes[2].pos)
  })

  it('the new node joins the branch of the node it follows', () => {
    let t = ok(addBranch(newTimeline('t1', 'Main'), { id: 'br', name: 'Alt', color: '#f00', dashed: true }))
    t = ok(addNode(t, { id: 'a' }))
    t = ok(updateNode(t, 'a', { branchId: 'br' }))
    t = ok(addNode(t, { id: 'b', afterId: 'a' }))
    expect(t.nodes[1].branchId).toBe('br')
  })

  it('updateNode changes only the given fields and refuses an unknown branch or node', () => {
    let t = ok(addNode(newTimeline('t1', 'Main'), { id: 'a', title: 'Old' }))
    t = ok(updateNode(t, 'a', { title: 'New', tag: 'x' }))
    expect(t.nodes[0]).toMatchObject({ title: 'New', tag: 'x', color: null })
    expect(updateNode(t, 'a', { branchId: 'nope' })).toEqual({ ok: false, reason: 'missing-branch' })
    expect(updateNode(t, 'zz', { title: 'x' })).toEqual({ ok: false, reason: 'missing-node' })
  })

  it('removing a branch moves its nodes to the main line', () => {
    let t = ok(addBranch(newTimeline('t1', 'Main'), { id: 'br', name: 'Alt', color: '#f00', dashed: false }))
    t = ok(addNode(t, { id: 'a' }))
    t = ok(updateNode(t, 'a', { branchId: 'br' }))
    t = ok(removeBranch(t, 'br'))
    expect(t.branches).toEqual([])
    expect(t.nodes[0].branchId).toBeNull()
    expect(timelineSchema.safeParse(t).success).toBe(true)
  })

  it('branch update and view change', () => {
    let t: Timeline = ok(addBranch(newTimeline('t1', 'Main'), { id: 'br', name: 'Alt', color: '#f00', dashed: false }))
    t = ok(updateBranch(t, 'br', { dashed: true, name: 'Other' }))
    expect(t.branches[0]).toMatchObject({ dashed: true, name: 'Other', color: '#f00' })
    expect(setView(t, 'date').view).toBe('date')
  })

  it('setPositions moves only listed nodes', () => {
    let t = ok(addNode(newTimeline('t1', 'Main'), { id: 'a' }))
    t = ok(addNode(t, { id: 'b' }))
    const before = t.nodes[1].pos
    t = setPositions(t, new Map([['a', { x: 5, y: 6 }]]))
    expect(t.nodes[0].pos).toEqual({ x: 5, y: 6 })
    expect(t.nodes[1].pos).toEqual(before)
  })
})
