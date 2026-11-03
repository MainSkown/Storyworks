import { describe, expect, it } from 'vitest'
import { conversationSchema, CONVERSATION_VERSION } from './conversation'

const base = { version: CONVERSATION_VERSION, id: 'c1', title: 'Talk' }

describe('conversation stub schema', () => {
  it('loads and fills defaults', () => {
    const r = conversationSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.status).toBe('draft')
      expect(r.data.synopsis).toBe('')
      expect(r.data.nodes).toEqual([])
    }
  })

  it('round trips through JSON', () => {
    const v = conversationSchema.parse(base)
    expect(conversationSchema.parse(JSON.parse(JSON.stringify(v)))).toEqual(v)
  })

  it('rejects nodes (arrive in S4), unknown fields, a wrong version and a bad status', () => {
    expect(conversationSchema.safeParse({ ...base, nodes: [{}] }).success).toBe(false)
    expect(conversationSchema.safeParse({ ...base, extra: 1 }).success).toBe(false)
    expect(conversationSchema.safeParse({ ...base, version: 2 }).success).toBe(false)
    expect(conversationSchema.safeParse({ ...base, status: 'x' }).success).toBe(false)
  })
})
