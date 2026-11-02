import type { LinkIndex } from './links'
import { relationshipsOnNode } from './relations'
import type { Group } from './schemas/group'
import type { Relationship } from './schemas/relationship'
import { findNode } from './tree'
import type { ManuscriptNode } from './schemas/manifest'

type Reader = Pick<LinkIndex, 'linksFrom' | 'linksTo'>

/** Links owned by these scenes (their passages disappear with them). */
export function brokenByDeletingScenes(index: Reader, sceneIds: readonly string[]): number {
  return [...new Set(sceneIds)].reduce((n, id) => n + index.linksFrom(id).length, 0)
}

/** Links pointing at this node. */
export function brokenByDeletingNode(index: Reader, timelineId: string, nodeId: string): number {
  return index.linksTo({ item: timelineId, block: nodeId }).length
}

/** Links pointing at any node of this timeline. */
export function brokenByDeletingTimeline(index: Reader, timelineId: string): number {
  return index.linksTo({ item: timelineId }).length
}

/** Passages linked to this codex entry (they show broken until it is restored). */
export function brokenByDeletingEntry(index: Reader, entryId: string): number {
  return index.linksTo({ item: entryId }).length
}

/** Relationships and group memberships of an entry (kept, shown broken, until it is restored). */
export function relationImpactOfEntry(
  entryId: string,
  relationships: readonly Relationship[],
  groups: readonly Group[],
): { relationships: Relationship[]; groups: Group[] } {
  return {
    relationships: relationships.filter((r) => r.fromId === entryId || r.toId === entryId),
    groups: groups.filter((g) => g.memberIds.includes(entryId)),
  }
}

/** Relationships whose node link points at this node. */
export const relationImpactOfNode = (
  timelineId: string,
  nodeId: string,
  relationships: readonly Relationship[],
): Relationship[] => relationshipsOnNode(relationships, timelineId, nodeId)

/** Scene ids in document order under a part, chapter or scene (itself included). */
export function sceneIdsUnder(tree: ManuscriptNode[], id: string): string[] {
  const out: string[] = []
  const walk = (n: ManuscriptNode) => {
    if (n.type === 'scene') out.push(n.id)
    n.children.forEach(walk)
  }
  const root = findNode(tree, id)
  if (root) walk(root)
  return out
}
