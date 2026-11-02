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
