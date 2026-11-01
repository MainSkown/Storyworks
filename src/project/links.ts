import { ref } from 'vue'
import type { z } from 'zod'
import { newId } from './ids'
import type { linkSchema } from './schemas/scene'

export type Link = z.infer<typeof linkSchema>
export type LinkRef = Link['from']

/** Link from a scene passage to a timeline node (`to.item` = timeline id, `to.block` = node id). */
export const EVENT_KIND = 'event'

const sameEnds = (a: Link, from: LinkRef, to: LinkRef) =>
  a.from.item === from.item &&
  a.from.block === from.block &&
  a.to.item === to.item &&
  a.to.block === to.block

export interface AddLinkResult {
  links: Link[]
  link: Link | null
  reason?: 'duplicate' | 'invalid'
}

/** Adds an event link; unique per (from block, to node). Returns the same array when refused. */
export function addLink(
  links: readonly Link[],
  input: { id?: string; from: LinkRef; to: LinkRef },
): AddLinkResult {
  const { from, to } = input
  if (from.block === undefined || to.block === undefined) {
    return { links: links as Link[], link: null, reason: 'invalid' }
  }
  if (links.some((l) => sameEnds(l, from, to))) {
    return { links: links as Link[], link: null, reason: 'duplicate' }
  }
  const link: Link = { id: input.id ?? newId(), kind: EVENT_KIND, from: { ...from }, to: { ...to } }
  return { links: [...links, link], link }
}

export function removeLink(links: readonly Link[], id: string): Link[] {
  return links.some((l) => l.id === id) ? links.filter((l) => l.id !== id) : (links as Link[])
}

/** Replaces the target of one link (repair). Refused when the block already links to that target. */
export function relinkTarget(
  links: readonly Link[],
  id: string,
  to: LinkRef,
): { links: Link[]; ok: boolean; reason?: 'not-found' | 'duplicate' } {
  const cur = links.find((l) => l.id === id)
  if (!cur) return { links: links as Link[], ok: false, reason: 'not-found' }
  if (links.some((l) => l.id !== id && sameEnds(l, cur.from, to))) {
    return { links: links as Link[], ok: false, reason: 'duplicate' }
  }
  return { links: links.map((l) => (l.id === id ? { ...l, to: { ...to } } : l)), ok: true }
}

export type ResolveResult =
  | { ok: true; kind: 'node' | 'block' }
  | { ok: false; reason: 'missing-node' | 'missing-timeline' | 'missing-block' | 'missing-scene' }

export interface LinkIndexOptions {
  /** True when the item exists and is not in the trash. */
  isLive: (itemId: string) => boolean
  /** Optional: true when the block still exists in the item. Only asked for live targets with a block. */
  blockExists?: (itemId: string, blockId: string) => boolean
}

// Plain code-unit comparison keeps the order identical on every machine.
const byId = (a: Link, b: Link) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function createLinkIndex({ isLive, blockExists }: LinkIndexOptions) {
  const byOwner = new Map<string, Link[]>()
  /** Bumped whenever links change, so panels and badges can react. */
  const revision = ref(0)

  const all = (): Link[] => [...byOwner.values()].flat().sort(byId)

  function isBroken(link: Link): boolean {
    const { item, block } = link.to
    if (!isLive(item)) return true
    return block !== undefined && blockExists !== undefined && !blockExists(item, block)
  }

  /** The passage side: its scene is gone or trashed, or its block is no longer in the scene. */
  function isPassageBroken(link: Link): boolean {
    const { item, block } = link.from
    if (!isLive(item)) return true
    return block !== undefined && blockExists !== undefined && !blockExists(item, block)
  }

  /**
   * Where a link leads. `to` (default): a timeline node (`kind:'node'`), reasons missing-timeline /
   * missing-node. `from`: the passage block, reasons missing-scene / missing-block.
   */
  function resolveTarget(link: Link, side: 'to' | 'from' = 'to'): ResolveResult {
    const { item, block } = link[side]
    if (!isLive(item))
      return { ok: false, reason: side === 'to' ? 'missing-timeline' : 'missing-scene' }
    if (block !== undefined && blockExists !== undefined && !blockExists(item, block)) {
      return { ok: false, reason: side === 'to' ? 'missing-node' : 'missing-block' }
    }
    return { ok: true, kind: side === 'to' ? 'node' : 'block' }
  }

  return {
    revision,
    /** Replaces all links declared by `owner`. Links are never dropped because a target vanished. */
    setLinks(owner: string, links: readonly Link[]): void {
      if (links.length === 0) byOwner.delete(owner)
      else byOwner.set(owner, [...links])
      revision.value++
    },
    removeOwner(owner: string): void {
      byOwner.delete(owner)
      revision.value++
    },
    /** Snapshot of every owner's links (for the re-home pass). */
    byOwner(): Map<string, Link[]> {
      return new Map([...byOwner].map(([k, v]) => [k, [...v]]))
    },
    isLive,
    linksFrom(owner: string): Link[] {
      return [...(byOwner.get(owner) ?? [])].sort(byId)
    },
    /** With a block: that block only. Without: the item and every block in it. */
    linksTo(target: LinkRef): Link[] {
      return all().filter(
        (l) =>
          l.to.item === target.item && (target.block === undefined || l.to.block === target.block),
      )
    },
    /** Target side only. */
    isBroken,
    isPassageBroken,
    /** Either side broken. */
    isAnyBroken: (link: Link): boolean => isBroken(link) || isPassageBroken(link),
    resolveTarget,
    brokenLinks(): Link[] {
      return all().filter(isBroken)
    },
  }
}

export type LinkIndex = ReturnType<typeof createLinkIndex>
