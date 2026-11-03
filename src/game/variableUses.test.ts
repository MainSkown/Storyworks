import { describe, expect, it } from 'vitest'
import { brokenUses, usesOfVariable, variableUses } from './variableUses'
import { conversationSchema, type Conversation } from '../project/schemas/conversation'
import type { Variable } from '../project/schemas/variables'

const conv = (id: string, nodes: unknown[]): Conversation =>
  conversationSchema.parse({ version: 2, id, title: id, startNodeId: null, nodes })

const base = { x: 0, y: 0 }
const sample = (id = 'c1') =>
  conv(id, [
    {
      ...base,
      id: 'n1',
      type: 'end',
      condition: { mode: 'all', terms: [{ variableId: 'gold', op: 'gt', value: 5 }] },
      sets: [{ variableId: 'met', op: 'set', value: true }],
    },
    {
      ...base,
      id: 'n2',
      type: 'choice',
      options: [
        {
          id: 'o1',
          text: 'Pay',
          target: null,
          condition: { mode: 'any', terms: [{ variableId: 'gold', op: 'gte', value: 1 }] },
          sets: [{ variableId: 'gold', op: 'add', value: -1 }],
        },
      ],
    },
  ])

describe('variableUses', () => {
  it('lists node and option conditions and sets in order', () => {
    expect(variableUses(sample())).toEqual([
      { variableId: 'gold', nodeId: 'n1', where: 'condition' },
      { variableId: 'met', nodeId: 'n1', where: 'set' },
      { variableId: 'gold', nodeId: 'n2', optionId: 'o1', where: 'condition' },
      { variableId: 'gold', nodeId: 'n2', optionId: 'o1', where: 'set' },
    ])
  })

  it('finds the uses of one variable across conversations', () => {
    const found = usesOfVariable([sample('a'), sample('b')], 'met')
    expect(found).toEqual([
      { conversationId: 'a', variableId: 'met', nodeId: 'n1', where: 'set' },
      { conversationId: 'b', variableId: 'met', nodeId: 'n1', where: 'set' },
    ])
    expect(usesOfVariable([sample()], 'nope')).toEqual([])
  })
})

describe('brokenUses', () => {
  const vars: Variable[] = [
    { id: 'gold', name: 'gold', type: 'number', default: 0 },
    { id: 'met', name: 'met', type: 'flag', default: false },
  ]

  it('is empty when every use fits its variable', () => {
    expect(brokenUses(sample(), vars)).toEqual([])
  })

  it('flags deleted variables and uses that no longer fit a changed type', () => {
    const retyped: Variable[] = [
      { id: 'gold', name: 'gold', type: 'text', default: '' },
      { id: 'met', name: 'met', type: 'flag', default: false },
    ]
    const out = brokenUses(sample(), retyped).map((u) => [u.nodeId, u.where, u.problem])
    expect(out).toEqual([
      ['n1', 'condition', 'type-mismatch'],
      ['n2', 'condition', 'type-mismatch'],
      ['n2', 'set', 'type-mismatch'],
    ])
    const gone = brokenUses(sample(), [vars[1]!]).map((u) => u.problem)
    expect(gone).toEqual(['undefined-variable', 'undefined-variable', 'undefined-variable'])
  })
})
