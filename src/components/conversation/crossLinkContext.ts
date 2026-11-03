import { computed, inject, provide, shallowRef, watch, type InjectionKey, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { linkContext, gameItems, type GameItem } from '../../storymap/items'
import { linksOf, resolveLink, type LinkBroken } from '../../game/crossLinks'
import type { Conversation, ConversationNode, ItemLink } from '../../project/schemas/conversation'
import { useProjectStore } from '../../project/store'
import { findNode } from '../../project/tree'
import { useNodeLabel } from './nodeTypes'

export interface ChipInfo {
  title: string
  /** Label of the linked node, when known. */
  node: string | null
  problem: LinkBroken | null
  /** The item is in the tree, so the chip can open it. */
  openable: boolean
}

/** Cross-item link state for the open conversation: items, lazily loaded targets, chip info. */
export function createCrossLinks(conv: Ref<Conversation | null>) {
  const { t } = useI18n()
  const project = useProjectStore()
  const labelOf = useNodeLabel()

  const items = computed<GameItem[]>(() =>
    project.project ? gameItems(project.project.manifest) : [],
  )
  const itemById = computed(() => new Map(items.value.map((i) => [i.id, i])))
  const loaded = shallowRef(new Map<string, Conversation>())

  function nodesOf(id: string): ConversationNode[] | null {
    if (id === conv.value?.id) return conv.value.nodes
    return loaded.value.get(id)?.nodes ?? null
  }
  const ctx = computed(() =>
    linkContext(items.value, (id) => {
      const nodes = nodesOf(id)
      return nodes ? new Set(nodes.map((n) => n.id)) : null
    }),
  )

  const wanted = computed(() => {
    const ids = new Set<string>()
    for (const s of conv.value ? linksOf(conv.value) : []) ids.add(s.link.itemId)
    const manuscript = project.project?.manifest.manuscript ?? []
    return [...ids]
      .filter((id) => id !== conv.value?.id)
      .filter((id) => {
        const i = itemById.value.get(id)
        return i?.type === 'conversation' && !i.trashed
      })
      .map((id) => ({ id, version: project.itemVersion(findNode(manuscript, id)?.path ?? '') }))
  })
  watch(
    wanted,
    async (list) => {
      const next = new Map<string, Conversation>()
      await Promise.all(
        list.map(async ({ id }) => {
          const r = await project.loadConversation(id)
          if (r.ok) next.set(id, r.value)
        }),
      )
      loaded.value = next
    },
    { immediate: true },
  )

  const problemOf = (link: ItemLink): LinkBroken | null => {
    const r = resolveLink(link, ctx.value)
    return r.ok ? null : r.reason
  }
  function chip(link: ItemLink): ChipInfo {
    const item = itemById.value.get(link.itemId)
    const nodes = link.nodeId ? nodesOf(link.itemId) : null
    const target = nodes?.find((n) => n.id === link.nodeId)
    return {
      title: item?.title || t('game.crossLink.deletedItem'),
      node: target ? labelOf(target) : null,
      problem: problemOf(link),
      openable: !!item && !item.trashed,
    }
  }

  return {
    items,
    itemById,
    currentId: computed(() => conv.value?.id ?? ''),
    nodesOf,
    nodeLabel: labelOf,
    chip,
    open: (id: string) => {
      project.selectedId = id
    },
  }
}

export type CrossLinks = ReturnType<typeof createCrossLinks>
const KEY: InjectionKey<CrossLinks> = Symbol('crossLinks')
export const provideCrossLinks = (x: CrossLinks) => provide(KEY, x)
export function useCrossLinks(): CrossLinks {
  const x = inject(KEY)
  if (!x) throw new Error('Cross-link context is not provided')
  return x
}
