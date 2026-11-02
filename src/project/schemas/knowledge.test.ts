import { describe, expect, it } from 'vitest'
import { parseFile } from '../serialize'
import { knowledgeItemSchema } from './knowledge'

const parse = (v: unknown) => parseFile(knowledgeItemSchema, JSON.stringify(v), 'knowledge/k1.json')
const at = { date: { year: 1, month: 0, day: 1 } }
const item = { version: 1, id: 'k1', title: 'The secret' }
const learning = { id: 'l1', entryId: 'e1', at }

describe('knowledge schema', () => {
  it('defaults fill in', () => {
    const r = parse({ ...item, learnings: [learning] })
    expect(r.ok && r.value).toMatchObject({
      description: { type: 'doc', content: [] },
      tags: [],
      about: null,
      learnings: [{ note: '', forgottenAt: null, revealedIn: null }],
    })
  })
  it('a full item loads', () => {
    const r = parse({
      ...item,
      about: { type: 'rule', id: 'r1' },
      learnings: [
        {
          ...learning,
          forgottenAt: { node: { timelineId: 't', nodeId: 'n' } },
          revealedIn: { sceneId: 's', blockId: 'b' },
        },
      ],
    })
    expect(r.ok).toBe(true)
  })
  it.each([
    ['duplicate learning id', { ...item, learnings: [learning, learning] }],
    ['bad about type', { ...item, about: { type: 'scene', id: 'x' } }],
    ['learning without position', { ...item, learnings: [{ id: 'l1', entryId: 'e1' }] }],
    ['unknown key', { ...item, extra: 1 }],
    ['wrong version', { ...item, version: 2 }],
  ])('rejects %s with the file name', (_n, bad) => {
    const r = parse(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.file).toBe('knowledge/k1.json')
  })
})
