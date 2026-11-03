import type { LinkContext } from '../game/mechanicLinks'
import type { MechanicLink, MechanicLinkKind } from '../project/schemas/mechanic'

export type LinkNames = Record<MechanicLinkKind, Map<string, string>>

export interface LinkNamesInput {
  variables: readonly { id: string; name: string }[]
  /** Scripts and conversations, trashed ones included. */
  items: readonly { id: string; title: string }[]
  beats: readonly { id: string; text: string }[]
  entries: readonly { id: string; name: string }[]
  mechanics: readonly { id: string; title: string }[]
  trash: readonly { id: string; title: string; type: string }[]
}

const EXCERPT = 60

const excerpt = (s: string): string => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > EXCERPT ? `${one.slice(0, EXCERPT - 1).trimEnd()}…` : one
}

/** Current names per kind; trashed entries and mechanics keep their title. */
export function buildLinkNames(i: LinkNamesInput): LinkNames {
  const names: LinkNames = {
    variable: new Map(i.variables.map((v) => [v.id, v.name])),
    item: new Map(i.items.map((x) => [x.id, x.title])),
    beat: new Map(i.beats.map((b) => [b.id, excerpt(b.text)])),
    entry: new Map(i.entries.map((e) => [e.id, e.name])),
    mechanic: new Map(i.mechanics.map((m) => [m.id, m.title])),
  }
  for (const t of i.trash) {
    if (t.type === 'entry' && !names.entry.has(t.id)) names.entry.set(t.id, t.title)
    if (t.type === 'mechanic' && !names.mechanic.has(t.id)) names.mechanic.set(t.id, t.title)
  }
  return names
}

/** Name of the target; `missing` when it no longer exists, `untitled` when its name is empty. */
export function linkLabel(
  link: MechanicLink,
  names: LinkNames,
  fallback: { missing: string; untitled: string },
): string {
  const name = names[link.kind].get(link.id)
  if (name === undefined) return fallback.missing
  return name.trim() || fallback.untitled
}

export interface LinkCandidate {
  id: string
  name: string
}

/** Live targets of one kind that the mechanic does not link to yet, filtered by the search text. */
export function linkCandidates(
  kind: MechanicLinkKind,
  o: { names: LinkNames; ctx: LinkContext; linked: readonly MechanicLink[]; selfId: string; query: string },
): LinkCandidate[] {
  const q = o.query.trim().toLowerCase()
  const taken = new Set(o.linked.filter((l) => l.kind === kind).map((l) => l.id))
  const out: LinkCandidate[] = []
  for (const [id, name] of o.names[kind]) {
    if (!o.ctx[kind].live.has(id) || taken.has(id)) continue
    if (kind === 'mechanic' && id === o.selfId) continue
    if (q && !name.toLowerCase().includes(q)) continue
    out.push({ id, name })
  }
  return out
}
