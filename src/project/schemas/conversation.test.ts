import { describe, expect, it } from 'vitest'
import { conversationSchema, CONVERSATION_VERSION } from './conversation'

const base = { version: CONVERSATION_VERSION, id: 'c1', title: 'Talk' }

const line = (lineId: string, extra: Record<string, unknown> = {}) => ({
  type: 'line',
  attrs: { id: `b${lineId}`, lineId, speakerId: null, speakerName: null, ...extra },
  content: [{ type: 'text', text: 'Hello' }],
})
const doc = (...lines: unknown[]) => ({ type: 'doc', content: lines })
const at = { x: 10, y: 20 }
const lines = (id: string, content: Record<string, unknown>, next: string | null = null) => ({
  id,
  type: 'lines',
  ...at,
  content,
  next,
})
const choice = (id: string, options: unknown[]) => ({ id, type: 'choice', ...at, options })
const opt = (id: string, target: string | null = null) => ({ id, text: id, target })

const full = {
  ...base,
  status: 'revising',
  synopsis: 'A chat',
  startNodeId: 'n1',
  nodes: [
    {
      ...lines('n1', doc(line('L000001'), line('L000002')), 'n2'),
      condition: { mode: 'all', terms: [{ variableId: 'v1', op: 'isTrue' }] },
      sets: [{ variableId: 'v2', op: 'add', value: 1 }],
    },
    choice('n2', [
      opt('o1', 'n3'),
      {
        ...opt('o2', 'n4'),
        condition: { mode: 'any', terms: [{ variableId: 'v2', op: 'gt', value: 2 }] },
        sets: [{ variableId: 'v1', op: 'toggle' }],
      },
    ]),
    { id: 'n3', type: 'jump', ...at, target: { nodeId: 'n1' } },
    { id: 'n4', type: 'end', ...at },
  ],
}

const ok = (v: unknown) => conversationSchema.safeParse(v).success

describe('conversation schema v3', () => {
  it('an empty conversation loads with defaults', () => {
    const r = conversationSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.status).toBe('draft')
      expect(r.data.synopsis).toBe('')
      expect(r.data.startNodeId).toBeNull()
      expect(r.data.nodes).toEqual([])
    }
  })

  it('the version is 3', () => {
    expect(CONVERSATION_VERSION).toBe(3)
    expect(ok({ ...base, version: 2 })).toBe(false)
  })

  it('a full file round trips through JSON', () => {
    const v = conversationSchema.parse(full)
    expect(conversationSchema.parse(JSON.parse(JSON.stringify(v)))).toEqual(v)
    expect(v.nodes).toHaveLength(4)
    expect(v.nodes[3]).toMatchObject({ type: 'end', sets: [] })
  })

  it('a lines node may be empty, and a doc without lines is allowed', () => {
    expect(ok({ ...base, nodes: [lines('a', { type: 'doc', content: [] })] })).toBe(true)
    expect(ok({ ...base, nodes: [lines('a', { type: 'doc' })] })).toBe(true)
  })

  it('rejects unknown fields, a bad status and a wrong version', () => {
    expect(ok({ ...base, extra: 1 })).toBe(false)
    expect(ok({ ...base, status: 'x' })).toBe(false)
    expect(ok({ ...base, version: 2 })).toBe(false)
  })

  it('rejects malformed nodes', () => {
    const bad = [
      {},
      { id: 'a', type: 'nope', ...at },
      { id: '', type: 'end', ...at },
      { id: 'a', type: 'end', x: 1 },
      { id: 'a', type: 'end', x: Infinity, y: 0 },
      { id: 'a', type: 'end', ...at, extra: 1 },
      { id: 'a', type: 'lines', ...at, next: null },
      { id: 'a', type: 'jump', ...at, target: 'b' },
      { id: 'a', type: 'jump', ...at },
      { id: 'a', type: 'choice', ...at },
      { id: 'a', type: 'end', ...at, condition: { mode: 'all', terms: [] } },
      { id: 'a', type: 'end', ...at, sets: [{ variableId: 'v', op: 'add' }] },
    ]
    for (const n of bad) expect(ok({ ...base, nodes: [n] })).toBe(false)
  })

  it('rejects a malformed option', () => {
    for (const o of [{ id: '', text: 'a', target: null }, { id: 'o', target: null }, { id: 'o', text: 'a' }])
      expect(ok({ ...base, nodes: [choice('a', [o])] })).toBe(false)
  })

  it('a choice with no options and a jump with no target are valid', () => {
    expect(ok({ ...base, nodes: [choice('a', [])] })).toBe(true)
    expect(ok({ ...base, nodes: [{ id: 'a', type: 'jump', ...at, target: null }] })).toBe(true)
  })

  it('rejects invalid line content', () => {
    const noId = doc({ type: 'line', attrs: { id: 'b1', lineId: 'bad' } })
    const mixed = doc(line('L000001'), { type: 'paragraph' })
    expect(ok({ ...base, nodes: [lines('a', noId)] })).toBe(false)
    expect(ok({ ...base, nodes: [lines('a', mixed)] })).toBe(false)
  })

  it('rejects a duplicate node id', () => {
    const end = { type: 'end', ...at }
    expect(ok({ ...base, nodes: [{ id: 'a', ...end }, { id: 'a', ...end }] })).toBe(false)
  })

  it('rejects a duplicate option id, within a choice and across choices', () => {
    expect(ok({ ...base, nodes: [choice('a', [opt('o'), opt('o')])] })).toBe(false)
    expect(ok({ ...base, nodes: [choice('a', [opt('o')]), choice('b', [opt('o')])] })).toBe(false)
    expect(ok({ ...base, nodes: [choice('a', [opt('o')]), choice('b', [opt('p')])] })).toBe(true)
  })

  it('an option id may equal a node id', () => {
    expect(ok({ ...base, nodes: [choice('a', [opt('a')])] })).toBe(true)
  })

  it('rejects a line id used twice in one node or across lines nodes', () => {
    expect(ok({ ...base, nodes: [lines('a', doc(line('L000001'), line('L000001', { id: 'x' })))] })).toBe(false)
    const a = lines('a', doc(line('L000001')))
    const b = lines('b', doc({ ...line('L000001'), attrs: { ...line('L000001').attrs, id: 'other' } }))
    expect(ok({ ...base, nodes: [a, b] })).toBe(false)
    const c = lines('c', doc({ ...line('L000002'), attrs: { ...line('L000002').attrs, id: 'other' } }))
    expect(ok({ ...base, nodes: [a, c] })).toBe(true)
  })

  it('rejects a block id used twice across nodes', () => {
    const a = lines('a', doc(line('L000001')))
    const b = lines('b', doc({ ...line('L000002'), attrs: { ...line('L000002').attrs, id: 'bL000001' } }))
    expect(ok({ ...base, nodes: [a, b] })).toBe(false)
  })

  it('dangling targets and a dangling start are accepted', () => {
    expect(
      ok({
        ...base,
        startNodeId: 'gone',
        nodes: [
          lines('a', doc(), 'gone'),
          choice('b', [opt('o', 'gone')]),
          { id: 'c', type: 'jump', ...at, target: { nodeId: 'gone' } },
        ],
      }),
    ).toBe(true)
  })

  it('a set that does not fit its variable type is not a schema matter', () => {
    const n = { id: 'a', type: 'end', ...at, sets: [{ variableId: 'text-var', op: 'add', value: 1 }] }
    expect(ok({ ...base, nodes: [n] })).toBe(true)
  })
})

describe('cross-item links', () => {
  const link = { itemId: 'c2', nodeId: 'x' }
  it('a jump and an option may carry a link to another item, with or without a node', () => {
    const j = { id: 'j', type: 'jump', ...at, target: null, link }
    const j2 = { id: 'j2', type: 'jump', ...at, target: null, link: { itemId: 's1' } }
    const c = choice('c', [{ ...opt('o1'), link }])
    expect(ok({ ...base, nodes: [j, j2, c] })).toBe(true)
  })

  it('a link round trips', () => {
    const v = conversationSchema.parse({
      ...base,
      nodes: [{ id: 'j', type: 'jump', ...at, target: null, link }],
    })
    expect(conversationSchema.parse(JSON.parse(JSON.stringify(v)))).toEqual(v)
  })

  it('rejects a link with an empty item id or unknown fields', () => {
    const j = (l: unknown) => ({ id: 'j', type: 'jump', ...at, target: null, link: l })
    expect(ok({ ...base, nodes: [j({ itemId: '' })] })).toBe(false)
    expect(ok({ ...base, nodes: [j({ nodeId: 'x' })] })).toBe(false)
    expect(ok({ ...base, nodes: [j({ itemId: 'a', junk: 1 })] })).toBe(false)
  })

  it('rejects a node target and a link set together', () => {
    const j = { id: 'j', type: 'jump', ...at, target: { nodeId: 'a' }, link }
    expect(ok({ ...base, nodes: [j] })).toBe(false)
    const c = choice('c', [{ ...opt('o1', 'a'), link }])
    expect(ok({ ...base, nodes: [c] })).toBe(false)
  })
})
