import type { Link } from './links'

export interface RehomeInput {
  /** Links by owner scene id. */
  links: ReadonlyMap<string, readonly Link[]>
  /** Block ids by scene id (only scenes whose file loaded). */
  blocks: ReadonlyMap<string, ReadonlySet<string>>
  isLive: (id: string) => boolean
}

export interface Rehomes {
  /** Write `link` to scene `to` first, then remove it from scene `from`. */
  moves: { from: string; to: string; link: Link }[]
  /** Copies to remove from `owner` (crash duplicates, or a move that would duplicate). */
  dupes: { owner: string; linkId: string }[]
}

const key = (l: Link) => `${l.kind}\u0000${l.from.block}\u0000${l.to.item}\u0000${l.to.block}`

/** Pure: which links follow their block into another scene, and which copies are redundant. */
export function findRehomes({ links, blocks, isLive }: RehomeInput): Rehomes {
  const dupes: Rehomes['dupes'] = []
  const owners = [...links.keys()].sort()
  const hasBlock = (scene: string, block: string | undefined) =>
    block !== undefined && (blocks.get(scene)?.has(block) ?? false)

  // Same link id in several scenes: keep the copy whose scene holds the block (else the first owner).
  const copies = new Map<string, string[]>()
  for (const o of owners)
    for (const l of links.get(o) ?? []) copies.set(l.id, [...(copies.get(l.id) ?? []), o])
  const dropped = new Set<string>()
  for (const [id, where] of copies) {
    if (where.length < 2) continue
    const link = (links.get(where[0]) ?? []).find((l) => l.id === id) as Link
    const keep = where.find((o) => hasBlock(o, link.from.block)) ?? where[0]
    for (const o of where)
      if (o !== keep) {
        dupes.push({ owner: o, linkId: id })
        dropped.add(`${o}\u0000${id}`)
      }
  }

  const present = new Map<string, Set<string>>() // owner -> link keys, for destination clash checks
  for (const o of owners) {
    present.set(
      o,
      new Set((links.get(o) ?? []).filter((l) => !dropped.has(`${o}\u0000${l.id}`)).map(key)),
    )
  }

  const moves: Rehomes['moves'] = []
  const liveScenes = [...blocks.keys()].filter(isLive).sort()
  for (const owner of owners) {
    if (!isLive(owner) || !blocks.has(owner)) continue
    for (const l of links.get(owner) ?? []) {
      if (dropped.has(`${owner}\u0000${l.id}`)) continue
      const block = l.from.block
      if (block === undefined || hasBlock(owner, block)) continue
      const candidates = liveScenes.filter((s) => s !== owner && hasBlock(s, block))
      if (candidates.length !== 1) continue
      const to = candidates[0]
      const moved: Link = { ...l, from: { ...l.from, item: to } }
      if (present.get(to)?.has(key(moved))) dupes.push({ owner, linkId: l.id })
      else {
        moves.push({ from: owner, to, link: moved })
        const set = present.get(to) ?? new Set()
        set.add(key(moved))
        present.set(to, set)
      }
    }
  }
  return { moves, dupes }
}
