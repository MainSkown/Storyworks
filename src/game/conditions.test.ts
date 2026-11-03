import { describe, expect, it } from 'vitest'
import {
  applySets,
  evaluateCondition,
  initialValues,
  opsFor,
  setOpsFor,
  useMismatch,
} from './conditions'
import { conditionSchema, setSchema, termSchema } from '../project/schemas/condition'
import type { Variable } from '../project/schemas/variables'
import type { Condition, SetOp } from '../project/schemas/condition'

const vars: Variable[] = [
  { id: 'f', name: 'met', type: 'flag', default: false },
  { id: 'n', name: 'gold', type: 'number', default: 10 },
  { id: 't', name: 'alias', type: 'text', default: 'x' },
]
const base = initialValues(vars)

const one = (term: Record<string, unknown>) => ({ mode: 'all', terms: [term] }) as Condition
const run = (cond: Condition | null | undefined, values = base) =>
  evaluateCondition(cond, vars, values)

describe('initialValues', () => {
  it('uses each default', () => {
    expect(base).toEqual({ f: false, n: 10, t: 'x' })
  })
})

describe('evaluateCondition: no condition', () => {
  it('absent, null and undefined are true', () => {
    expect(run(undefined)).toEqual({ ok: true, value: true })
    expect(run(null)).toEqual({ ok: true, value: true })
  })
})

describe('evaluateCondition: operators', () => {
  it('flag isTrue / isFalse', () => {
    const t = { ...base, f: true }
    expect(run(one({ variableId: 'f', op: 'isTrue' }), t)).toEqual({ ok: true, value: true })
    expect(run(one({ variableId: 'f', op: 'isTrue' }))).toEqual({ ok: true, value: false })
    expect(run(one({ variableId: 'f', op: 'isFalse' }))).toEqual({ ok: true, value: true })
    expect(run(one({ variableId: 'f', op: 'isFalse' }), t)).toEqual({ ok: true, value: false })
  })

  it.each([
    ['eq', 10, true],
    ['eq', 9, false],
    ['neq', 9, true],
    ['neq', 10, false],
    ['gt', 9, true],
    ['gt', 10, false],
    ['lt', 11, true],
    ['lt', 10, false],
    ['gte', 10, true],
    ['gte', 11, false],
    ['lte', 10, true],
    ['lte', 9, false],
  ])('number %s %s -> %s', (op, value, expected) => {
    expect(run(one({ variableId: 'n', op, value }))).toEqual({ ok: true, value: expected })
  })

  it('text eq / neq are exact', () => {
    expect(run(one({ variableId: 't', op: 'eq', value: 'x' }))).toEqual({ ok: true, value: true })
    expect(run(one({ variableId: 't', op: 'eq', value: 'X' }))).toEqual({ ok: true, value: false })
    expect(run(one({ variableId: 't', op: 'neq', value: 'y' }))).toEqual({ ok: true, value: true })
    expect(run(one({ variableId: 't', op: 'neq', value: 'x' }))).toEqual({ ok: true, value: false })
  })
})

describe('evaluateCondition: ALL / ANY', () => {
  const yes = { variableId: 'f', op: 'isFalse' }
  const no = { variableId: 'f', op: 'isTrue' }
  it.each([
    ['all', [yes, yes], true],
    ['all', [yes, no], false],
    ['all', [no, yes], false],
    ['all', [no, no], false],
    ['any', [yes, yes], true],
    ['any', [yes, no], true],
    ['any', [no, yes], true],
    ['any', [no, no], false],
  ] as const)('%s of %j', (mode, terms, expected) => {
    expect(run({ mode, terms: [...terms] } as Condition)).toEqual({ ok: true, value: expected })
  })
})

describe('evaluateCondition: problems', () => {
  it('a missing variable is reported', () => {
    expect(run(one({ variableId: 'gone', op: 'isTrue' }))).toEqual({
      ok: false,
      reason: { kind: 'undefined-variable', variableId: 'gone' },
    })
  })

  it('an operator or value that does not fit the type is reported', () => {
    const mismatches = [
      { variableId: 'f', op: 'eq', value: 1 },
      { variableId: 'n', op: 'isTrue' },
      { variableId: 'n', op: 'eq', value: 'a' },
      { variableId: 't', op: 'gt', value: 1 },
      { variableId: 't', op: 'eq', value: 1 },
      { variableId: 'n', op: 'eq' },
    ]
    for (const term of mismatches)
      expect(run(one(term))).toEqual({
        ok: false,
        reason: { kind: 'type-mismatch', variableId: term.variableId },
      })
  })

  it('stops at the first problem even when ANY is already true', () => {
    const c = {
      mode: 'any',
      terms: [
        { variableId: 'f', op: 'isFalse' },
        { variableId: 'gone', op: 'isTrue' },
        { variableId: 'n', op: 'eq', value: 'a' },
      ],
    } as Condition
    expect(run(c)).toEqual({
      ok: false,
      reason: { kind: 'undefined-variable', variableId: 'gone' },
    })
  })

  it('stops at the first problem even when ALL is already false', () => {
    const c = {
      mode: 'all',
      terms: [
        { variableId: 'f', op: 'isTrue' },
        { variableId: 'n', op: 'eq', value: 'a' },
      ],
    } as Condition
    expect(run(c)).toEqual({ ok: false, reason: { kind: 'type-mismatch', variableId: 'n' } })
  })
})

describe('condition schema', () => {
  it('accepts a valid condition and round trips', () => {
    const c = {
      mode: 'any',
      terms: [
        { variableId: 'f', op: 'isTrue' },
        { variableId: 'n', op: 'gte', value: 3 },
        { variableId: 't', op: 'neq', value: '' },
      ],
    }
    const v = conditionSchema.parse(c)
    expect(conditionSchema.parse(JSON.parse(JSON.stringify(v)))).toEqual(c)
  })

  it('rejects no terms, a bad mode, unknown fields and an empty variable id', () => {
    expect(conditionSchema.safeParse({ mode: 'all', terms: [] }).success).toBe(false)
    expect(conditionSchema.safeParse({ mode: 'xor', terms: [{ variableId: 'f', op: 'isTrue' }] }).success).toBe(false)
    expect(conditionSchema.safeParse({ mode: 'all', terms: [{ variableId: 'f', op: 'isTrue' }], x: 1 }).success).toBe(false)
    expect(termSchema.safeParse({ variableId: '', op: 'isTrue' }).success).toBe(false)
  })

  it('rejects a bad operator or a value that does not fit the operator', () => {
    const bad = [
      { variableId: 'f', op: 'maybe' },
      { variableId: 'f', op: 'isTrue', value: true },
      { variableId: 'n', op: 'gt' },
      { variableId: 'n', op: 'gt', value: 'a' },
      { variableId: 'n', op: 'lt', value: Infinity },
      { variableId: 'n', op: 'eq', value: NaN },
      { variableId: 'n', op: 'eq', value: true },
      { variableId: 't', op: 'eq' },
    ]
    for (const t of bad) expect(termSchema.safeParse(t).success).toBe(false)
  })
})

describe('set schema', () => {
  it('accepts set (any type), add (number) and toggle (no value)', () => {
    for (const s of [
      { variableId: 'f', op: 'set', value: true },
      { variableId: 'n', op: 'set', value: 3 },
      { variableId: 't', op: 'set', value: '' },
      { variableId: 'n', op: 'add', value: -2 },
      { variableId: 'f', op: 'toggle' },
    ])
      expect(setSchema.safeParse(s).success).toBe(true)
  })

  it('rejects missing or wrong values and unknown operators', () => {
    for (const s of [
      { variableId: 'n', op: 'set' },
      { variableId: 'n', op: 'add' },
      { variableId: 'n', op: 'add', value: 'a' },
      { variableId: 'n', op: 'add', value: Infinity },
      { variableId: 'f', op: 'toggle', value: true },
      { variableId: 'f', op: 'flip' },
      { variableId: '', op: 'toggle' },
    ])
      expect(setSchema.safeParse(s).success).toBe(false)
  })
})

describe('applySets', () => {
  const apply = (sets: SetOp[], values = base) => applySets(sets, vars, values)

  it('set, add and toggle change the matching variable', () => {
    const r = apply([
      { variableId: 'f', op: 'toggle' },
      { variableId: 'n', op: 'add', value: 5 },
      { variableId: 't', op: 'set', value: 'y' },
    ])
    expect(r).toEqual({ ok: true, values: { f: true, n: 15, t: 'y' } })
  })

  it('set works for every type and later sets see earlier ones', () => {
    const r = apply([
      { variableId: 'n', op: 'set', value: 1 },
      { variableId: 'n', op: 'add', value: 1 },
      { variableId: 'f', op: 'set', value: true },
      { variableId: 'f', op: 'toggle' },
    ])
    expect(r).toEqual({ ok: true, values: { f: false, n: 2, t: 'x' } })
  })

  it('does not mutate the input values', () => {
    const input = { ...base }
    const r = apply([{ variableId: 'n', op: 'add', value: 1 }], input)
    expect(input).toEqual(base)
    expect(r.ok && r.values).not.toBe(input)
  })

  it('no sets returns an equal copy', () => {
    const r = apply([])
    expect(r).toEqual({ ok: true, values: base })
    expect(r.ok && r.values).not.toBe(base)
  })

  it('a missing variable is reported', () => {
    expect(apply([{ variableId: 'gone', op: 'toggle' }])).toEqual({
      ok: false,
      reason: { kind: 'undefined-variable', variableId: 'gone' },
    })
  })

  it('add on a non-number, toggle on a non-flag and a set of the wrong type are reported', () => {
    const bad = [
      { variableId: 't', op: 'add', value: 1 },
      { variableId: 'f', op: 'add', value: 1 },
      { variableId: 'n', op: 'toggle' },
      { variableId: 't', op: 'toggle' },
      { variableId: 'n', op: 'set', value: 'a' },
      { variableId: 'f', op: 'set', value: 1 },
      { variableId: 't', op: 'set', value: false },
    ] as SetOp[]
    for (const s of bad)
      expect(apply([s])).toEqual({
        ok: false,
        reason: { kind: 'type-mismatch', variableId: s.variableId },
      })
  })

  it('stops at the first problem and leaves the input alone', () => {
    const input = { ...base }
    const r = apply(
      [
        { variableId: 'n', op: 'add', value: 1 },
        { variableId: 'gone', op: 'toggle' },
        { variableId: 't', op: 'add', value: 1 },
      ],
      input,
    )
    expect(r).toEqual({ ok: false, reason: { kind: 'undefined-variable', variableId: 'gone' } })
    expect(input).toEqual(base)
  })
})

describe('opsFor', () => {
  it('lists the comparison operators per type', () => {
    expect(opsFor('flag')).toEqual(['isTrue', 'isFalse'])
    expect(opsFor('number')).toEqual(['eq', 'neq', 'gt', 'lt', 'gte', 'lte'])
    expect(opsFor('text')).toEqual(['eq', 'neq'])
  })

  it('lists the set operators per type', () => {
    expect(setOpsFor('flag')).toEqual(['set', 'toggle'])
    expect(setOpsFor('number')).toEqual(['set', 'add'])
    expect(setOpsFor('text')).toEqual(['set'])
  })
})

describe('useMismatch', () => {
  const gold: Variable = { id: 'g', name: 'gold', type: 'number', default: 0 }
  const met: Variable = { id: 'm', name: 'met', type: 'flag', default: false }
  const name: Variable = { id: 't', name: 'name', type: 'text', default: '' }

  it('is null when the term or set fits the variable', () => {
    expect(useMismatch(gold, { variableId: 'g', op: 'gte', value: 3 })).toBeNull()
    expect(useMismatch(met, { variableId: 'm', op: 'isTrue' })).toBeNull()
    expect(useMismatch(name, { variableId: 't', op: 'eq', value: 'x' })).toBeNull()
    expect(useMismatch(gold, { variableId: 'g', op: 'add', value: 2 })).toBeNull()
    expect(useMismatch(met, { variableId: 'm', op: 'toggle' })).toBeNull()
  })

  it('reports a missing variable', () => {
    expect(useMismatch(undefined, { variableId: 'g', op: 'toggle' })).toBe('undefined-variable')
  })

  it('reports an operator or value that no longer fits the type', () => {
    expect(useMismatch(name, { variableId: 't', op: 'gt', value: 1 })).toBe('type-mismatch')
    expect(useMismatch(gold, { variableId: 'g', op: 'eq', value: 'x' })).toBe('type-mismatch')
    expect(useMismatch(gold, { variableId: 'g', op: 'isTrue' })).toBe('type-mismatch')
    expect(useMismatch(name, { variableId: 't', op: 'add', value: 1 })).toBe('type-mismatch')
    expect(useMismatch(gold, { variableId: 'g', op: 'set', value: true })).toBe('type-mismatch')
    expect(useMismatch(gold, { variableId: 'g', op: 'toggle' })).toBe('type-mismatch')
  })
})
