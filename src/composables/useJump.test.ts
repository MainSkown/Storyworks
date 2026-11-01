import { describe, expect, it } from 'vitest'
import { createJump, type JumpDeps } from './useJump'

function setup(ok: boolean) {
  const calls: string[] = []
  const deps: JumpDeps = {
    resolve: () => (ok ? { ok: true, kind: 'node' } : { ok: false, reason: 'missing-node' }),
    goTo: async (name) => void calls.push('go:' + name),
    selectTimeline: (id) => void calls.push('tl:' + id),
    selectNode: (id) => void calls.push('node:' + id),
    showEditor: () => void calls.push('editor'),
    selectScene: (id) => void calls.push('scene:' + id),
    revealBlock: (s, b) => void calls.push(`reveal:${s}:${b}`),
  }
  return { jump: createJump(deps), calls }
}

describe('jump', () => {
  it('a broken node target does not navigate', async () => {
    const { jump, calls } = setup(false)
    expect(await jump.toNode('t1', 'n1')).toEqual({ ok: false, reason: 'missing-node' })
    expect(calls).toEqual([])
    expect(jump.pendingNode.value).toBeNull()
  })
  it('a broken block target does not navigate', async () => {
    const { jump, calls } = setup(false)
    expect((await jump.toBlock('s1', 'b1')).ok).toBe(false)
    expect(calls).toEqual([])
  })
  it('a node jump selects, navigates and leaves a pending target', async () => {
    const { jump, calls } = setup(true)
    expect((await jump.toNode('t1', 'n1')).ok).toBe(true)
    expect(calls).toEqual(['tl:t1', 'node:n1', 'go:timelines'])
    expect(jump.pendingNode.value).toEqual({ timelineId: 't1', nodeId: 'n1' })
    expect(jump.takePendingNode('t1', 'n1')).toBe(true)
    expect(jump.pendingNode.value).toBeNull()
  })
  it('a block jump shows the editor, opens the scene and reveals the block', async () => {
    const { jump, calls } = setup(true)
    expect((await jump.toBlock('s1', 'b1')).ok).toBe(true)
    expect(calls).toEqual(['editor', 'scene:s1', 'go:write', 'reveal:s1:b1'])
  })
})
