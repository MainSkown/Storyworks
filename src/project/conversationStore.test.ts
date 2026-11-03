import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from './store'
import { connect, updateOption } from '../game/conversationGraph'
import type { Conversation } from './schemas/conversation'

let io: MemoryProjectIO
beforeEach(() => {
  io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

async function gameStore() {
  setActivePinia(createPinia())
  const s = useProjectStore()
  expect(await s.create('game', { title: 'G', author: 'A', language: 'en', kind: 'game' })).toBe(
    'opened',
  )
  return s
}
const okValue = async (s: ReturnType<typeof useProjectStore>, id: string) => {
  const r = await s.loadConversation(id)
  if (!r.ok) throw new Error('not loaded')
  return r.value
}
const lineIdsOf = (c: Conversation) =>
  c.nodes.flatMap((n) =>
    n.type === 'lines'
      ? (n.content.content as { attrs: { lineId: string } }[]).map((l) => l.attrs.lineId)
      : [],
  )

describe('loadConversation', () => {
  it('returns the saved file, then the unsaved value', async () => {
    const s = await gameStore()
    const id = await s.addConversation(null, 'Talk')
    expect((await okValue(s, id)).title).toBe('Talk')
    await s.patchConversation(id, (c) => ({ ...c, synopsis: 'draft' }))
    expect((await okValue(s, id)).synopsis).toBe('draft') // still pending
  })

  it('is not ok for an unknown id, a script and a malformed file', async () => {
    const s = await gameStore()
    const sc = await s.addScript(null, 'S')
    const id = await s.addConversation(null, 'Talk')
    await s.flush()
    expect((await s.loadConversation('nope')).ok).toBe(false)
    expect((await s.loadConversation(sc)).ok).toBe(false)
    io.files.set(s.tree.find((n) => n.id === id)!.path as string, '{"version":2}')
    expect((await s.loadConversation(id)).ok).toBe(false)
  })
})

describe('addConversationNode', () => {
  it('a Lines node starts with one empty line with a fresh line id', async () => {
    const s = await gameStore()
    s.reserveLineId() // L000001 is taken
    const id = await s.addConversation(null, 'Talk')
    const nodeId = await s.addConversationNode(id, 'lines')
    const c = await okValue(s, id)
    expect(nodeId).toBe(c.nodes[0]!.id)
    expect(c.startNodeId).toBe(nodeId)
    const n = c.nodes[0]!
    expect(n.type === 'lines' && n.content.content).toMatchObject([
      { type: 'line', attrs: { lineId: 'L000002', speakerId: null, speakerName: null } },
    ])
    expect(s.reserveLineId()).toBe('L000003')
  })

  it('places the next node after the focused one and links it', async () => {
    const s = await gameStore()
    const id = await s.addConversation(null, 'Talk')
    const a = (await s.addConversationNode(id, 'lines'))!
    const b = (await s.addConversationNode(id, 'end', { afterId: a }))!
    const c = await okValue(s, id)
    expect(c.nodes.find((n) => n.id === b)).toMatchObject({ type: 'end', x: 220, y: 0 })
    expect(c.nodes[0]).toMatchObject({ next: b })
  })

  it('uses the given position and gives every Lines node unique line ids', async () => {
    const s = await gameStore()
    const id = await s.addConversation(null, 'Talk')
    await s.addConversationNode(id, 'lines', { x: 5, y: 7 })
    await s.addConversationNode(id, 'lines')
    await s.addConversationNode(id, 'lines')
    const c = await okValue(s, id)
    expect(c.nodes[0]).toMatchObject({ x: 5, y: 7 })
    expect(new Set(lineIdsOf(c)).size).toBe(3)
  })

  it('returns null for an unknown conversation', async () => {
    const s = await gameStore()
    expect(await s.addConversationNode('nope', 'end')).toBeNull()
  })
})

describe('line counter', () => {
  it('opening a project raises the counter above line ids found in a conversation', async () => {
    const s = await gameStore()
    const id = await s.addConversation(null, 'Talk')
    await s.addConversationNode(id, 'lines') // L000001
    await s.flush()
    const path = s.tree[0]!.path as string
    await s.close()
    const text = (io.files.get(path) as string).replace('L000001', 'L000050')
    io.files.set(path, text)
    expect(await s.open('game/project.json')).toBe('opened')
    expect(s.reserveLineId()).toBe('L000051')
  })

  it('a saved edit with higher line ids raises the counter too', async () => {
    const s = await gameStore()
    const id = await s.addConversation(null, 'Talk')
    await s.addConversationNode(id, 'lines')
    await s.patchConversation(id, (c) => ({
      ...c,
      nodes: c.nodes.map((n) =>
        n.type === 'lines'
          ? {
              ...n,
              content: {
                type: 'doc',
                content: [
                  { type: 'line', attrs: { id: 'b9', lineId: 'L000090', speakerId: null, speakerName: null } },
                ],
              },
            }
          : n,
      ),
    }))
    expect(s.reserveLineId()).toBe('L000091')
  })
})

describe('reopen', () => {
  it('a conversation with nodes, options, conditions and sets reopens identical', async () => {
    const s = await gameStore()
    const id = await s.addConversation(null, 'Talk')
    const a = (await s.addConversationNode(id, 'lines'))!
    const ch = (await s.addConversationNode(id, 'choice', { afterId: a }))!
    const e = (await s.addConversationNode(id, 'end'))!
    await s.patchConversation(id, (c) => {
      let n = connect(c, ch, e, { newOptionId: 'o1' })
      n = updateOption(n, ch, 'o1', {
        text: 'Pay',
        condition: { mode: 'any', terms: [{ variableId: 'gold', op: 'gte', value: 5 }] },
        sets: [{ variableId: 'gold', op: 'add', value: -5 }],
      })
      return {
        ...n,
        nodes: n.nodes.map((x) =>
          x.id === e
            ? { ...x, sets: [{ variableId: 'met', op: 'toggle' as const }] }
            : x.id === a
              ? { ...x, condition: { mode: 'all' as const, terms: [{ variableId: 'met', op: 'isFalse' as const }] } }
              : x,
        ),
      }
    })
    const before = await okValue(s, id)
    await s.close()
    expect(await s.open('game/project.json')).toBe('opened')
    expect(s.issues).toEqual([])
    expect(await okValue(s, id)).toEqual(before)
  })
})

describe('conversation words', () => {
  it('counts line text in the item, its folder and the project, and drops it when deleted', async () => {
    const s = await gameStore()
    const folder = await s.addFolder(null, 'F')
    const id = await s.addConversation(folder, 'Talk')
    const a = (await s.addConversationNode(id, 'lines'))!
    await s.patchConversation(id, (c) => ({
      ...c,
      nodes: c.nodes.map((n) =>
        n.id === a && n.type === 'lines'
          ? {
              ...n,
              content: {
                type: 'doc',
                content: [
                  {
                    type: 'line',
                    attrs: { id: 'b1', lineId: 'L000001', speakerId: null, speakerName: null },
                    content: [{ type: 'text', text: 'one two three' }],
                  },
                ],
              },
            }
          : n,
      ),
    }))
    expect(s.wordCounts.get(id)).toBe(3)
    expect(s.wordCounts.get(folder)).toBe(3)
    expect(s.wordCounts.get('')).toBe(3)
    await s.close()
    await s.open('game/project.json')
    expect(s.wordCounts.get('')).toBe(3)
    await s.deleteItem(id)
    expect(s.wordCounts.get('')).toBe(0)
  })
})
