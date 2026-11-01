import type { ManuscriptNode } from './schemas/manifest'

export interface TargetOption {
  id: string
  /** ancestor titles joined with " › " */
  label: string
}

/** Every node of the given types in tree order, labelled by its path. */
export function targetOptions(
  tree: ManuscriptNode[],
  types: ManuscriptNode['type'][],
): TargetOption[] {
  const out: TargetOption[] = []
  const walk = (nodes: ManuscriptNode[], trail: string[]) => {
    for (const n of nodes) {
      const path = [...trail, n.title]
      if (types.includes(n.type)) out.push({ id: n.id, label: path.join(' › ') })
      walk(n.children, path)
    }
  }
  walk(tree, [])
  return out
}
