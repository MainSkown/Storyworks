import type { ManuscriptNode } from './schemas/manifest'
import type { Scene } from './schemas/scene'
import { kindProfile } from './kinds'

type NodeType = ManuscriptNode['type']

type Parents = Record<NodeType, (NodeType | null)[]>

const ALLOWED_PARENT: Parents = {
  part: [null],
  chapter: [null, 'part'],
  scene: [null, 'part', 'chapter'],
  conversation: [],
}

// Game: folders (chapter nodes) nest; scripts and conversations sit in a folder or at the root.
const GAME_PARENT: Parents = {
  part: [null],
  chapter: [null, 'chapter'],
  scene: [null, 'chapter'],
  conversation: [null, 'chapter'],
}

const parentsOf = (kind: string): Parents => (kindProfile(kind).nestedFolders ? GAME_PARENT : ALLOWED_PARENT)

function find(nodes: ManuscriptNode[], id: string): ManuscriptNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = find(n.children, id)
    if (hit) return hit
  }
  return null
}

export const findNode = find

/**
 * Pure move. `index` is the final position among the new parent's children
 * (after removal). Returns null on unknown ids, cycles or wrong nesting.
 */
export function moveTo(
  tree: ManuscriptNode[],
  id: string,
  parentId: string | null,
  index: number,
  kind = 'book',
): ManuscriptNode[] | null {
  const next = structuredClone(tree)
  const node = find(next, id)
  if (!node) return null
  const parent = parentId === null ? null : find(next, parentId)
  if (parentId !== null && !parent) return null
  if (parent && (parent.id === id || find(node.children, parent.id))) return null
  if (!parentsOf(kind)[node.type].includes(parent?.type ?? null)) return null

  const detach = (list: ManuscriptNode[]): boolean => {
    const i = list.findIndex((n) => n.id === id)
    if (i >= 0) {
      list.splice(i, 1)
      return true
    }
    return list.some((n) => detach(n.children))
  }
  detach(next)
  const target = parent ? parent.children : next
  target.splice(Math.max(0, Math.min(index, target.length)), 0, node)
  return next
}

/** Keeps scenes whose status is in `statuses`, plus their ancestors. */
export function filterByStatus(
  tree: ManuscriptNode[],
  statusOf: (sceneId: string) => Scene['status'],
  statuses: Set<Scene['status']>,
): ManuscriptNode[] {
  const out: ManuscriptNode[] = []
  for (const n of tree) {
    if (n.type === 'scene') {
      if (statuses.has(statusOf(n.id))) out.push({ ...n })
    } else {
      const children = filterByStatus(n.children, statusOf, statuses)
      if (children.length) out.push({ ...n, children })
    }
  }
  return out
}

export interface Slot {
  parentId: string | null
  index: number
}

function locate(
  nodes: ManuscriptNode[],
  id: string,
  parent: ManuscriptNode | null = null,
): { parent: ManuscriptNode | null; index: number; siblings: ManuscriptNode[] } | null {
  const i = nodes.findIndex((n) => n.id === id)
  if (i >= 0) return { parent, index: i, siblings: nodes }
  for (const n of nodes) {
    const hit = locate(n.children, id, n)
    if (hit) return hit
  }
  return null
}

/** The slot for `moveTo` if it is valid and actually changes something. */
function validSlot(tree: ManuscriptNode[], id: string, slot: Slot, kind: string): Slot | null {
  const here = locate(tree, id)
  if (!here) return null
  if ((here.parent?.id ?? null) === slot.parentId && here.index === slot.index) return null
  return moveTo(tree, id, slot.parentId, slot.index, kind) ? slot : null
}

/** Target for Alt+arrow keys: up/down swap, in = indent, out = outdent. */
export function keyboardMove(
  tree: ManuscriptNode[],
  id: string,
  dir: 'up' | 'down' | 'in' | 'out',
  kind = 'book',
): Slot | null {
  const here = locate(tree, id)
  if (!here) return null
  const parentId = here.parent?.id ?? null
  let slot: Slot | null = null
  if (dir === 'up') slot = here.index > 0 ? { parentId, index: here.index - 1 } : null
  else if (dir === 'down')
    slot = here.index < here.siblings.length - 1 ? { parentId, index: here.index + 1 } : null
  else if (dir === 'in') {
    const prev = here.siblings[here.index - 1]
    slot = prev ? { parentId: prev.id, index: prev.children.length } : null
  } else if (here.parent) {
    const up = locate(tree, here.parent.id)
    slot = up ? { parentId: up.parent?.id ?? null, index: up.index + 1 } : null
  }
  return slot && validSlot(tree, id, slot, kind)
}

/** Target for dropping `dragId` before, after or inside the row `overId`. */
export function dropSlot(
  tree: ManuscriptNode[],
  dragId: string,
  overId: string,
  zone: 'before' | 'after' | 'inside',
  kind = 'book',
): Slot | null {
  if (dragId === overId) return null
  const over = locate(tree, overId)
  const drag = locate(tree, dragId)
  if (!over || !drag) return null
  if (zone === 'inside') {
    const target = over.siblings[over.index]!
    return validSlot(tree, dragId, { parentId: overId, index: target.children.length }, kind)
  }
  const parentId = over.parent?.id ?? null
  let index = zone === 'before' ? over.index : over.index + 1
  if (drag.parent === over.parent && drag.index < index) index--
  return validSlot(tree, dragId, { parentId, index }, kind)
}
