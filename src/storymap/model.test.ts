import { describe, expect, it } from 'vitest'
import { startStory, viewStory } from '../game/storyPlaythrough'
import { conversationSchema } from '../project/schemas/conversation'
import { buildStoryModel, type ModelSource } from './model'

const conv = conversationSchema.parse({
  version: 3, id: 'c1', title: 'Talk', startNodeId: 'e',
  nodes: [{ id: 'e', type: 'end', x: 0, y: 0, sets: [] }],
})
const node = (id: string, type: 'scene' | 'conversation') => ({ id, type, title: id, children: [] }) as never
const src: ModelSource = {
  manifest: {
    manuscript: [node('c1', 'conversation'), node('s1', 'scene'), node('c2', 'conversation'), node('s2', 'scene')],
    trash: [{ id: 'c9', type: 'conversation', title: 'Old' } as never],
  },
  loadConversation: async (id) => (id === 'c1' ? { ok: true, value: conv } : { ok: false }),
  loadScriptLines: async (id) => (id === 's1' ? [{ lineId: 'L1', kind: 'speech', text: 'Hi' }] : null),
}

describe('buildStoryModel', () => {
  it('resolves live conversations and scripts, trashed items, and unusable or unknown items as missing', async () => {
    const m = await buildStoryModel(src, { version: 1, boxes: [], arrows: [] }, [])
    expect(m.resolve('c1')).toMatchObject({ kind: 'conversation', title: 'c1' })
    expect(m.resolve('s1')).toMatchObject({ kind: 'script', lines: [{ text: 'Hi' }] })
    expect(m.resolve('c9')).toEqual({ kind: 'trashed', title: 'Old' })
    expect(m.resolve('c2')).toEqual({ kind: 'missing' })
    expect(m.resolve('s2')).toEqual({ kind: 'missing' })
    expect(m.resolve('nope')).toEqual({ kind: 'missing' })
  })

  it('the model drives a play-through', async () => {
    const m = await buildStoryModel(src, { version: 1, boxes: [], arrows: [] }, [])
    expect(viewStory(startStory(m, { itemId: 'c1' }))).toEqual({ kind: 'end' })
    expect(viewStory(startStory(m, { itemId: 'c2' })).kind).toBe('stopped')
  })
})
