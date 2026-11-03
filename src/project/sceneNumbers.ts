import type { ManuscriptNode } from './schemas/manifest'

/** Block type of a screenplay scene heading (see src/editor/screenplay). */
export const SCENE_HEADING_TYPE = 'sceneHeading'

export interface SceneNumbers {
  /** heading block id -> running number */
  byBlock: Map<string, number>
  /** item id (scene or folder) -> number of its first heading; absent when it has none */
  byItem: Map<string, number>
}

/** Ids of the scene heading blocks of a ProseMirror doc, in document order. */
export function sceneHeadingIds(content: unknown): string[] {
  const out: string[] = []
  const kids = (content as { content?: unknown } | null)?.content
  if (!Array.isArray(kids)) return out
  for (const k of kids as { type?: unknown; attrs?: { id?: unknown } }[]) {
    if (k?.type === SCENE_HEADING_TYPE && typeof k.attrs?.id === 'string') out.push(k.attrs.id)
  }
  return out
}

/**
 * Numbers every heading through the whole script in tree order. Derived, never stored.
 * Only scenes in the tree are walked, so trashed scenes get nothing.
 */
export function sceneNumbers(
  tree: ManuscriptNode[],
  headings: ReadonlyMap<string, readonly string[]>,
): SceneNumbers {
  const byBlock = new Map<string, number>()
  const byItem = new Map<string, number>()
  let next = 1
  const walk = (node: ManuscriptNode) => {
    const first = next
    if (node.type === 'scene') for (const id of headings.get(node.id) ?? []) byBlock.set(id, next++)
    else node.children.forEach(walk)
    if (next > first) byItem.set(node.id, first)
  }
  tree.forEach(walk)
  return { byBlock, byItem }
}
