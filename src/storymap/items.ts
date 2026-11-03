import type { LinkContext } from '../game/crossLinks'
import type { Manifest } from '../project/schemas/manifest'

export interface GameItem {
  id: string
  type: 'scene' | 'conversation'
  title: string
  /** Titles of the enclosing folders, outermost first (empty for trashed items). */
  folder: string[]
  trashed: boolean
}

/** Scripts and conversations: live ones in tree order, then trashed ones. */
export function gameItems(m: Pick<Manifest, 'manuscript' | 'trash'>): GameItem[] {
  const out: GameItem[] = []
  const walk = (nodes: Manifest['manuscript'], folder: string[]) => {
    for (const n of nodes) {
      if (n.type === 'scene' || n.type === 'conversation')
        out.push({ id: n.id, type: n.type, title: n.title, folder, trashed: false })
      else walk(n.children, [...folder, n.title])
    }
  }
  walk(m.manuscript, [])
  for (const t of m.trash)
    if (t.type === 'scene' || t.type === 'conversation')
      out.push({ id: t.id, type: t.type, title: t.title, folder: [], trashed: true })
  return out
}

export function linkContext(
  items: readonly GameItem[],
  nodeIds: (conversationId: string) => ReadonlySet<string> | null,
): LinkContext {
  const byId = new Map(items.map((i) => [i.id, i]))
  return {
    item: (id) => {
      const i = byId.get(id)
      return i ? { type: i.type, trashed: i.trashed } : null
    },
    nodeIds,
  }
}
