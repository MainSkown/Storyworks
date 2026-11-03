import type { Condition } from '../project/schemas/condition'

export interface ConditionWords {
  /** Variable name; undefined = the variable was deleted. */
  variable(id: string): string | undefined
  op(op: string): string
  deleted: string
  and: string
  or: string
}

/** "Has key is true and Gold is at least 5" (the label of an arrow). */
export function conditionText(c: Condition, w: ConditionWords): string {
  return c.terms
    .map((t) => {
      const value = 'value' in t ? ` ${String(t.value)}` : ''
      return `${w.variable(t.variableId) ?? w.deleted} ${w.op(t.op)}${value}`
    })
    .join(` ${c.mode === 'all' ? w.and : w.or} `)
}
