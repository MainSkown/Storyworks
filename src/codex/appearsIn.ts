import { CODEX_KIND, type Link } from '../project/links'

/**
 * Codex links to the entry in reading order: scene order, then block position in the scene.
 * Gone scenes and unknown blocks come last; ties break by link id.
 */
export function orderPassages(
  links: readonly Link[],
  entryId: string,
  sceneOrder: readonly string[],
  blockOrder: ReadonlyMap<string, readonly string[]>,
): Link[] {
  const sceneAt = new Map(sceneOrder.map((id, i) => [id, i]))
  const blockAt = (l: Link) => blockOrder.get(l.from.item)?.indexOf(l.from.block ?? '') ?? -1
  const rank = (n: number) => (n < 0 ? Number.MAX_SAFE_INTEGER : n)
  return links
    .filter((l) => l.kind === CODEX_KIND && l.to.item === entryId && l.from.block !== undefined)
    .sort(
      (a, b) =>
        rank(sceneAt.get(a.from.item) ?? -1) - rank(sceneAt.get(b.from.item) ?? -1) ||
        (a.from.item < b.from.item ? -1 : a.from.item > b.from.item ? 1 : 0) ||
        rank(blockAt(a)) - rank(blockAt(b)) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
}
