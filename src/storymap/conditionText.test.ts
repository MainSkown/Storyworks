import { describe, expect, it } from 'vitest'
import { conditionText, type ConditionWords } from './conditionText'

const w: ConditionWords = {
  variable: (id) => ({ a: 'Key', b: 'Gold' })[id],
  op: (o) => o,
  deleted: '?',
  and: '&',
  or: '|',
}

describe('conditionText', () => {
  it('joins terms with the mode word and shows values', () => {
    const c = {
      mode: 'all',
      terms: [
        { variableId: 'a', op: 'isTrue' },
        { variableId: 'b', op: 'gte', value: 5 },
      ],
    } as const
    expect(conditionText(c as never, w)).toBe('Key isTrue & Gold gte 5')
    expect(conditionText({ ...c, mode: 'any' } as never, w)).toBe('Key isTrue | Gold gte 5')
  })

  it('names a deleted variable', () => {
    expect(conditionText({ mode: 'all', terms: [{ variableId: 'x', op: 'isFalse' }] }, w)).toBe(
      '? isFalse',
    )
  })
})
