import { useMismatch, type Problem } from './conditions'
import type { SetOp, Term } from '../project/schemas/condition'
import type { Conversation } from '../project/schemas/conversation'
import type { Variable } from '../project/schemas/variables'

export interface VariableUse {
  variableId: string
  nodeId: string
  optionId?: string
  where: 'condition' | 'set'
}

export interface ConversationUse extends VariableUse {
  conversationId: string
}

export interface BrokenUse extends VariableUse {
  problem: Problem['kind']
}

type Walked = VariableUse & { use: Term | SetOp }

function* walk(c: Conversation): Generator<Walked> {
  for (const n of c.nodes) {
    for (const use of n.condition?.terms ?? [])
      yield { variableId: use.variableId, nodeId: n.id, where: 'condition', use }
    for (const use of n.sets) yield { variableId: use.variableId, nodeId: n.id, where: 'set', use }
    if (n.type !== 'choice') continue
    for (const o of n.options) {
      const at = { nodeId: n.id, optionId: o.id }
      for (const use of o.condition?.terms ?? [])
        yield { variableId: use.variableId, ...at, where: 'condition', use }
      for (const use of o.sets) yield { variableId: use.variableId, ...at, where: 'set', use }
    }
  }
}

/** Every condition term and set in the conversation, in node order. */
export const variableUses = (c: Conversation): VariableUse[] =>
  [...walk(c)].map((w) => {
    const u: VariableUse = { variableId: w.variableId, nodeId: w.nodeId, where: w.where }
    return w.optionId === undefined ? u : { ...u, optionId: w.optionId }
  })

export const usesOfVariable = (convs: readonly Conversation[], variableId: string): ConversationUse[] =>
  convs.flatMap((c) =>
    variableUses(c)
      .filter((u) => u.variableId === variableId)
      .map((u) => ({ conversationId: c.id, ...u })),
  )

/** Uses whose variable is gone or whose operator/value no longer fits its type ("needs review"). */
export function brokenUses(c: Conversation, variables: readonly Variable[]): BrokenUse[] {
  const out: BrokenUse[] = []
  for (const { use, ...u } of walk(c)) {
    const problem = useMismatch(
      variables.find((v) => v.id === use.variableId),
      use,
    )
    if (problem) out.push({ ...u, problem })
  }
  return out
}
