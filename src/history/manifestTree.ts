// Helpers for editing a raw manifest tree (manuscript nodes, ref lists) while merging or restoring.
export type Obj = Record<string, unknown>
export type TreeNode = Obj & { id: string; children: TreeNode[] }

export function findNode(tree: TreeNode[], id: string): { list: TreeNode[]; index: number } | null {
  for (let i = 0; i < tree.length; i++) {
    if (tree[i].id === id) return { list: tree, index: i }
    const r = findNode(tree[i].children, id)
    if (r) return r
  }
  return null
}

/** Inserts after the nearest preceding sibling (in `order`) that exists in `target`; else at the front. */
export function insertAfterPredecessor<T extends { id: string }>(target: T[], item: T, order: string[]): void {
  for (let i = order.indexOf(item.id) - 1; i >= 0; i--) {
    const j = target.findIndex((t) => t.id === order[i])
    if (j >= 0) { target.splice(j + 1, 0, item); return }
  }
  target.splice(0, 0, item)
}
