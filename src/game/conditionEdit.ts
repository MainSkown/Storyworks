import type { Condition, SetOp, Term, TermOp } from '../project/schemas/condition'
import type { Variable, VariableType } from '../project/schemas/variables'
import { opsFor, setOpsFor } from './conditions'

type Value = boolean | number | string

const defaultOf = (type: VariableType): Value =>
  type === 'flag' ? false : type === 'number' ? 0 : ''
const fits = (type: VariableType, v: unknown): v is Value =>
  typeof v === (type === 'flag' ? 'boolean' : type === 'number' ? 'number' : 'string')

/** A term for `op` on `v`; flag ops carry no value, the others keep `value` when it fits. */
export function makeTerm(v: Variable, op: TermOp, value?: unknown): Term {
  if (v.type === 'flag') return { variableId: v.id, op: op === 'isFalse' ? 'isFalse' : 'isTrue' }
  const val = fits(v.type, value) ? value : defaultOf(v.type)
  return { variableId: v.id, op, value: val } as Term
}

export const newTerm = (v: Variable): Term => makeTerm(v, opsFor(v.type)[0])

/** Picking another variable keeps the operator and value when they still fit. */
export function retargetTerm(term: Term, v: Variable): Term {
  const op = (opsFor(v.type) as readonly string[]).includes(term.op) ? term.op : opsFor(v.type)[0]
  return makeTerm(v, op, 'value' in term ? term.value : undefined)
}

export function makeSet(v: Variable, op: SetOp['op'], value?: unknown): SetOp {
  if (op === 'toggle') return { variableId: v.id, op }
  if (op === 'add') return { variableId: v.id, op, value: typeof value === 'number' ? value : 1 }
  return { variableId: v.id, op, value: fits(v.type, value) ? value : v.default }
}

export const newSet = (v: Variable): SetOp => makeSet(v, setOpsFor(v.type)[0])

export function retargetSet(set: SetOp, v: Variable): SetOp {
  const op = setOpsFor(v.type).includes(set.op) ? set.op : setOpsFor(v.type)[0]
  return makeSet(v, op, 'value' in set ? set.value : undefined)
}

/** A condition needs at least one term; none left means no condition. */
export function conditionOf(
  mode: Condition['mode'],
  terms: readonly Term[],
): Condition | undefined {
  return terms.length ? { mode, terms: [...terms] } : undefined
}

/** Plain text of the first non-empty line block, for the node preview. */
export function firstLineText(content: Record<string, unknown>): string {
  const text = (n: unknown): string => {
    const x = n as { text?: unknown; content?: unknown[] } | null
    if (typeof x?.text === 'string') return x.text
    return Array.isArray(x?.content) ? x.content.map(text).join('') : ''
  }
  const blocks = Array.isArray(content.content) ? content.content : []
  for (const b of blocks) {
    const s = text(b).trim()
    if (s) return s
  }
  return ''
}
