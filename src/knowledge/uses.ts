import { EVENT_KIND, type Link } from '../project/links'
import type { Position } from '../timeline/order'

/** Timeline-node positions of a passage block, from its event links (link order). */
export function usePositionsForBlock(
  links: readonly Link[],
  sceneId: string,
  blockId: string,
): Position[] {
  return links
    .filter(
      (l) =>
        l.kind === EVENT_KIND &&
        l.from.item === sceneId &&
        l.from.block === blockId &&
        l.to.block !== undefined,
    )
    .map((l) => ({ node: { timelineId: l.to.item, nodeId: l.to.block as string } }))
}

/** Same answers as `usePositionsForBlock`, for many lookups over one link list (one pass instead of one per lookup). */
export function positionsByBlock(
  links: readonly Link[],
): (sceneId: string, blockId: string) => Position[] {
  const byKey = new Map<string, Position[]>()
  for (const l of links) {
    if (l.kind !== EVENT_KIND || l.from.block === undefined || l.to.block === undefined) continue
    const key = `${l.from.item}\u0000${l.from.block}`
    const list = byKey.get(key) ?? []
    list.push({ node: { timelineId: l.to.item, nodeId: l.to.block } })
    byKey.set(key, list)
  }
  return (sceneId, blockId) => byKey.get(`${sceneId}\u0000${blockId}`) ?? []
}
