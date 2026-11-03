import { brokenLinks, mechanicsFor, type LinkContext } from '../game/mechanicLinks'
import { usesOfVariable } from '../game/variableUses'
import type { Conversation } from '../project/schemas/conversation'
import type { Mechanic } from '../project/schemas/mechanic'
import { makeFinding, type Finding } from './types'

/** Plain inputs; the caller must pass only live (not trashed) mechanics. */
export interface GameDocInput {
  mechanics: readonly Mechanic[]
  linkContext: LinkContext
  variables: readonly { id: string; name: string }[]
  conversations: readonly Conversation[]
}

const mechanicLocation = (m: Mechanic) => [{ kind: 'mechanic' as const, id: m.id, label: m.title }]

export function mechanicBrokenLinks({ mechanics, linkContext }: GameDocInput): Finding[] {
  return mechanics.flatMap((m) =>
    brokenLinks(m, linkContext).map(({ link }) =>
      makeFinding(
        'mechanic-broken-link',
        [m.id, link.kind, link.id],
        `Mechanic "${m.title}" links to an item that is missing or deleted.`,
        mechanicLocation(m),
        false,
        { variant: link.kind, params: { mechanic: m.title } },
      ),
    ),
  )
}

export function mechanicsNoLinks({ mechanics }: GameDocInput): Finding[] {
  return mechanics
    .filter((m) => m.status === 'implemented' && m.links.length === 0)
    .map((m) =>
      makeFinding(
        'mechanic-no-links',
        [m.id],
        `Mechanic "${m.title}" is marked Implemented but has no links.`,
        mechanicLocation(m),
        false,
        { params: { mechanic: m.title } },
      ),
    )
}

export function variablesUnused({ mechanics, variables, conversations }: GameDocInput): Finding[] {
  return variables
    .filter(
      (v) =>
        mechanicsFor('variable', v.id, mechanics).length === 0 &&
        usesOfVariable(conversations, v.id).length === 0,
    )
    .map((v) =>
      makeFinding(
        'variable-unused',
        [v.id],
        `Variable "${v.name}" is not used by any mechanic, condition or set.`,
        [{ kind: 'variable', id: v.id, label: v.name }],
        false,
        { params: { variable: v.name } },
      ),
    )
}
