import { describe, expect, it } from 'vitest'
import type { Condition } from '../project/schemas/condition'
import type { Variable } from '../project/schemas/variables'
import { MAX_STEPS } from './playthrough'
import { describeStop, formatCondition, isChanged, type TextCtx } from './playthroughText'

const names: Record<string, string> = { g: 'Gold', k: 'Met king', w: 'Word' }
const ctx: TextCtx = {
  variableName: (id) => names[id] ?? '?',
  opLabel: (op) => ({ isTrue: 'is true', gte: 'is at least', eq: 'equals' })[op as string] ?? op,
  nodeLabel: (id) => `Node ${id}`,
  joiner: (m) => (m === 'all' ? 'and' : 'or'),
}

describe('formatCondition', () => {
  it('names variables and operators, joins by mode', () => {
    const c: Condition = {
      mode: 'any',
      terms: [
        { variableId: 'g', op: 'gte', value: 5 },
        { variableId: 'k', op: 'isTrue' },
        { variableId: 'w', op: 'eq', value: 'hi' },
      ],
    }
    expect(formatCondition(c, ctx)).toBe(
      'Gold is at least 5 or Met king is true or Word equals "hi"',
    )
  })
})

describe('describeStop', () => {
  it('node-blocked carries node and condition words, no ids', () => {
    const d = describeStop(
      {
        kind: 'node-blocked',
        nodeId: 'n1',
        failedCondition: { mode: 'all', terms: [{ variableId: 'k', op: 'isTrue' }] },
      },
      ctx,
    )
    expect(d.key).toBe('game.conversation.playthrough.stop.nodeBlocked')
    expect(d.params).toEqual({ node: 'Node n1', condition: 'Met king is true' })
  })
  it('names the variable for an undefined variable', () => {
    const d = describeStop({ kind: 'undefined-variable', variableId: 'g', nodeId: 'n2' }, ctx)
    expect(d.params.variable).toBe('Gold')
  })
  it('splits missing target by option', () => {
    expect(describeStop({ kind: 'missing-target', nodeId: 'a' }, ctx).key).toMatch(/missingTarget$/)
    expect(describeStop({ kind: 'missing-target', nodeId: 'a', optionId: 'o' }, ctx).key).toMatch(
      /missingOptionTarget$/,
    )
  })
  it('step limit reports the cap', () => {
    expect(describeStop({ kind: 'step-limit' }, ctx).params).toEqual({ max: MAX_STEPS })
  })
})

describe('isChanged', () => {
  const v: Variable = { id: 'g', name: 'Gold', type: 'number', default: 1 }
  it('compares with the default', () => {
    expect(isChanged(v, { g: 1 })).toBe(false)
    expect(isChanged(v, { g: 2 })).toBe(true)
  })
})
