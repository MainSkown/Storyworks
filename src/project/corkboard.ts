import type { ManuscriptNode } from './schemas/manifest'
import { moveTo, type Slot } from './tree'

export interface CorkCard {
  node: ManuscriptNode
  /** position among its parent's children (whole tree, not just scenes) */
  index: number
}

/** Scenes that sit in one container, shown under an optional part/chapter heading. */
export interface CorkSection {
  key: string
  parentId: string | null
  heading: ManuscriptNode | null
  scenes: CorkCard[]
}

/** Flat sections in tree order; a container keeps an (empty) section so it stays a drop target. */
export function groupScenes(tree: ManuscriptNode[]): CorkSection[] {
  const out: CorkSection[] = []
  const walk = (nodes: ManuscriptNode[], parentId: string | null, first: CorkSection | null) => {
    let cur = first
    nodes.forEach((node, index) => {
      if (node.type === 'scene') {
        if (!cur) {
          cur = { key: `${parentId ?? 'root'}:${index}`, parentId, heading: null, scenes: [] }
          out.push(cur)
        }
        cur.scenes.push({ node, index })
        return
      }
      const section: CorkSection = { key: node.id, parentId: node.id, heading: node, scenes: [] }
      out.push(section)
      walk(node.children, node.id, section)
      cur = null
    })
  }
  walk(tree, null, null)
  return out
}

/** Keyboard target: end of the previous section, or start of the next one. */
export function crossSlot(
  tree: ManuscriptNode[],
  sceneId: string,
  dir: 'prev' | 'next',
): Slot | null {
  const sections = groupScenes(tree)
  const at = sections.findIndex((s) => s.scenes.some((c) => c.node.id === sceneId))
  const target = sections[at + (dir === 'prev' ? -1 : 1)]
  if (at < 0 || !target) return null
  const edge = dir === 'prev' ? target.scenes.at(-1) : target.scenes[0]
  const index = edge ? (dir === 'prev' ? edge.index + 1 : edge.index) : 0
  const slot = { parentId: target.parentId, index }
  return moveTo(tree, sceneId, slot.parentId, slot.index) ? slot : null
}
