import type { Variable, VariableType } from '../project/schemas/variables'
import {
  FLAG_OPS,
  NUMBER_OPS,
  TEXT_OPS,
  type Condition,
  type SetOp,
  type Term,
  type TermOp,
} from '../project/schemas/condition'

export type VariableValue = boolean | number | string
export type Values = Record<string, VariableValue>

export interface Problem {
  kind: 'undefined-variable' | 'type-mismatch'
  variableId: string
}

export type Evaluation = { ok: true; value: boolean } | { ok: false; reason: Problem }
export type Applied = { ok: true; values: Values } | { ok: false; reason: Problem }

export const initialValues = (variables: readonly Variable[]): Values =>
  Object.fromEntries(variables.map((v) => [v.id, v.default]))

/** Comparison operators a condition term may use on a variable of this type. */
export function opsFor(type: VariableType): readonly TermOp[] {
  return type === 'flag' ? FLAG_OPS : type === 'number' ? NUMBER_OPS : TEXT_OPS
}

/** Operators a set may use on a variable of this type. */
export function setOpsFor(type: VariableType): readonly SetOp['op'][] {
  return type === 'flag' ? ['set', 'toggle'] : type === 'number' ? ['set', 'add'] : ['set']
}

const problem = (kind: Problem['kind'], variableId: string) =>
  ({ ok: false, reason: { kind, variableId } }) as const

const jsType = (t: VariableType) => (t === 'flag' ? 'boolean' : t === 'number' ? 'number' : 'string')

/** Current value, falling back to the default when the map lacks it or holds the wrong type. */
function currentOf(v: Variable, values: Values): VariableValue {
  const x = values[v.id]
  return typeof x === jsType(v.type) ? x : v.default
}

/** The term's truth, or null when its operator or value does not fit the variable's type. */
function testTerm(term: Term, v: Variable, now: VariableValue): boolean | null {
  if (!(opsFor(v.type) as readonly string[]).includes(term.op)) return null
  if (v.type === 'flag') return term.op === 'isTrue' ? now === true : now === false
  if (!('value' in term) || typeof term.value !== jsType(v.type)) return null
  const a = now as number | string
  const b = term.value
  switch (term.op) {
    case 'eq':
      return a === b
    case 'neq':
      return a !== b
    case 'gt':
      return a > b
    case 'lt':
      return a < b
    case 'gte':
      return a >= b
    case 'lte':
      return a <= b
    default:
      return null
  }
}

/** Why a term or set cannot work on `v` (undefined = the variable is gone); null when it fits. */
export function useMismatch(v: Variable | undefined, use: Term | SetOp): Problem['kind'] | null {
  if (!v) return 'undefined-variable'
  const ok =
    use.op === 'set'
      ? typeof use.value === jsType(v.type)
      : use.op === 'add'
        ? v.type === 'number'
        : use.op === 'toggle'
          ? v.type === 'flag'
          : testTerm(use, v, v.default) !== null
  return ok ? null : 'type-mismatch'
}

/**
 * No condition is true. Terms are checked left to right and the first problem wins, even
 * when ANY/ALL could already be decided, so a broken term never hides behind a passing one.
 */
export function evaluateCondition(
  cond: Condition | null | undefined,
  variables: readonly Variable[],
  values: Values,
): Evaluation {
  if (!cond) return { ok: true, value: true }
  const results: boolean[] = []
  for (const term of cond.terms) {
    const v = variables.find((x) => x.id === term.variableId)
    if (!v) return problem('undefined-variable', term.variableId)
    const r = testTerm(term, v, currentOf(v, values))
    if (r === null) return problem('type-mismatch', term.variableId)
    results.push(r)
  }
  return { ok: true, value: cond.mode === 'all' ? results.every(Boolean) : results.some(Boolean) }
}

/** Runs the sets in order on a copy of `values`; the input is never changed. */
export function applySets(
  sets: readonly SetOp[],
  variables: readonly Variable[],
  values: Values,
): Applied {
  const out: Values = { ...values }
  for (const s of sets) {
    const v = variables.find((x) => x.id === s.variableId)
    if (!v) return problem('undefined-variable', s.variableId)
    if (s.op === 'set') {
      if (typeof s.value !== jsType(v.type)) return problem('type-mismatch', v.id)
      out[v.id] = s.value
    } else if (s.op === 'add') {
      if (v.type !== 'number' || typeof s.value !== 'number') return problem('type-mismatch', v.id)
      out[v.id] = (currentOf(v, out) as number) + s.value
    } else {
      if (v.type !== 'flag') return problem('type-mismatch', v.id)
      out[v.id] = !(currentOf(v, out) as boolean)
    }
  }
  return { ok: true, values: out }
}
