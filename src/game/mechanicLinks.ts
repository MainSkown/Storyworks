import type { Mechanic, MechanicLink, MechanicLinkKind } from '../project/schemas/mechanic'

/** What exists for each link kind: live targets, and trashed ones (a restore repairs those). */
export type LinkContext = Record<MechanicLinkKind, { live: ReadonlySet<string>; trashed: ReadonlySet<string> }>

export type LinkResolution = { ok: true } | { ok: false; reason: 'missing' | 'trashed' }

export function resolveLink(link: MechanicLink, ctx: LinkContext): LinkResolution {
  const t = ctx[link.kind]
  if (t.live.has(link.id)) return { ok: true }
  return { ok: false, reason: t.trashed.has(link.id) ? 'trashed' : 'missing' }
}

export interface BrokenMechanicLink {
  link: MechanicLink
  reason: 'missing' | 'trashed'
}

export function brokenLinks(m: Mechanic, ctx: LinkContext): BrokenMechanicLink[] {
  const out: BrokenMechanicLink[] = []
  for (const link of m.links) {
    const r = resolveLink(link, ctx)
    if (!r.ok) out.push({ link, reason: r.reason })
  }
  return out
}

/** Mechanics (in the given order) that link to the target; a mechanic's link to itself is ignored. */
export function mechanicsFor(kind: MechanicLinkKind, id: string, all: readonly Mechanic[]): Mechanic[] {
  return all.filter(
    (m) => !(kind === 'mechanic' && m.id === id) && m.links.some((l) => l.kind === kind && l.id === id),
  )
}

/** Mechanics this one links to plus those linking to it, each once, never itself. */
export function relatedMechanics(m: Mechanic, all: readonly Mechanic[]): Mechanic[] {
  const out = new Set(m.links.filter((l) => l.kind === 'mechanic' && l.id !== m.id).map((l) => l.id))
  for (const o of mechanicsFor('mechanic', m.id, all)) out.add(o.id)
  return all.filter((o) => out.has(o.id))
}

const same = (a: MechanicLink, b: MechanicLink) => a.kind === b.kind && a.id === b.id

/** Returns the same object when nothing changes (duplicate, or a mechanic linking to itself). */
export function addLink(m: Mechanic, link: MechanicLink): Mechanic {
  if (link.kind === 'mechanic' && link.id === m.id) return m
  if (m.links.some((l) => same(l, link))) return m
  return { ...m, links: [...m.links, link] }
}

export function removeLink(m: Mechanic, link: MechanicLink): Mechanic {
  if (!m.links.some((l) => same(l, link))) return m
  return { ...m, links: m.links.filter((l) => !same(l, link)) }
}
