import type { z } from 'zod'
import type { linkSchema } from './schemas/scene'

export type Link = z.infer<typeof linkSchema>
export type LinkRef = Link['from']

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

  const all = (): Link[] => [...byOwner.values()].flat().sort(byId)

  function isBroken(link: Link): boolean {
    const { item, block } = link.to
    if (!isLive(item)) return true
    return block !== undefined && blockExists !== undefined && !blockExists(item, block)
  }

  return {
    /** Replaces all links declared by `owner`. Links are never dropped because a target vanished. */
    setLinks(owner: string, links: readonly Link[]): void {
      if (links.length === 0) byOwner.delete(owner)
      else byOwner.set(owner, [...links])
    },
    removeOwner(owner: string): void {
      byOwner.delete(owner)
    },
    linksFrom(owner: string): Link[] {
      return [...(byOwner.get(owner) ?? [])].sort(byId)
    },
    /** With a block: that block only. Without: the item and every block in it. */
    linksTo(target: LinkRef): Link[] {
      return all().filter(
        (l) => l.to.item === target.item && (target.block === undefined || l.to.block === target.block),
      )
    },
    isBroken,
    brokenLinks(): Link[] {
      return all().filter(isBroken)
    },
  }
}

export type LinkIndex = ReturnType<typeof createLinkIndex>
