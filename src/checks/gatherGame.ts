import { brokenTargets } from '../game/conversationGraph'
import { linkProblems } from '../game/crossLinks'
import type { ShownLine } from '../game/playthrough'
import { listRoutes } from '../game/routes'
import { buildLinkContext } from '../gamedoc/linkContext'
import type { Conversation } from '../project/schemas/conversation'
import type { Mechanic } from '../project/schemas/mechanic'
import type { StoryMap } from '../project/schemas/storyMap'
import type { Variable } from '../project/schemas/variables'
import { buildStoryModel, type ModelSource } from '../storymap/model'
import { gameItems, linkContext } from '../storymap/items'
import { findNode } from '../project/tree'
import { speakerIdsOf, type GameCheckItem } from './game'
import type { GameCheckData } from './run'
import type { BrokenRef } from './structural'

/** Plain inputs for the game checks; the stores are adapted into this by `gatherCheckData`. */
export interface GameGatherSource {
  manifest: ModelSource['manifest']
  loadConversation: ModelSource['loadConversation']
  loadScriptLines(id: string): Promise<ShownLine[] | null>
  variables: readonly Variable[]
  /** Live codex entry ids. */
  codexIds: readonly string[]
  map: StoryMap
  timelines: Parameters<typeof listRoutes>[0]
  /** Live (readable, not trashed) mechanics. */
  mechanics: readonly Mechanic[]
  /** Ids of every listed mechanic, readable or not. */
  mechanicIds: readonly string[]
}

/**
 * Loads each live script and conversation once and builds the game slice, plus the dangling
 * cross-links and node targets that `broken-link` reports.
 */
export async function gatherGameData(
  src: GameGatherSource,
): Promise<{ game: GameCheckData; refs: BrokenRef[] }> {
  const { manifest } = src
  const model = await buildStoryModel(src, src.map, src.variables)
  const items: GameCheckItem[] = gameItems(manifest).map((i) => ({
    id: i.id,
    title: i.title,
    type: i.type,
    trashed: i.trashed,
    ...routesOf(src, i.id),
  }))

  const conversations = new Map<string, Conversation>()
  const speakerIds = new Map<string, string[]>()
  for (const item of items) {
    const r = item.trashed ? null : model.resolve(item.id)
    if (r?.kind === 'conversation') {
      conversations.set(item.id, r.conversation)
      speakerIds.set(item.id, speakerIdsOf(r.conversation))
    } else if (r?.kind === 'script')
      speakerIds.set(item.id, [...new Set(r.lines.flatMap((l) => (l.speakerId ? [l.speakerId] : [])))])
  }

  const ctx = linkContext(gameItems(manifest), (id) => {
    const c = conversations.get(id)
    return c ? new Set(c.nodes.map((n) => n.id)) : null
  })
  const refs: BrokenRef[] = []
  for (const item of items) {
    const conv = conversations.get(item.id)
    if (!conv) continue
    const own = { ownerKind: 'item' as const, ownerId: item.id, ownerLabel: item.title }
    for (const p of linkProblems(conv, ctx))
      refs.push({
        ...own,
        ownerBlockId: p.nodeId,
        ...(p.optionId === undefined ? {} : { ownerOptionId: p.optionId }),
        ...(p.reason === 'node-missing' ? { variant: 'node-target' as const } : {}),
        targetId: p.link.nodeId ? `${p.link.itemId}:${p.link.nodeId}` : p.link.itemId,
      })
    for (const b of brokenTargets(conv))
      refs.push({
        ...own,
        ownerBlockId: b.nodeId,
        ...(b.optionId === undefined ? {} : { ownerOptionId: b.optionId }),
        variant: 'node-target',
        targetId: b.targetId,
      })
  }

  const live = src.mechanics
  return {
    refs,
    game: {
      graph: {
        items,
        conversations,
        variables: src.variables,
        map: src.map,
        routes: listRoutes(src.timelines),
      },
      speakers: { items, speakerIds, codexIds: new Set(src.codexIds) },
      doc: {
        mechanics: live,
        linkContext: buildLinkContext({
          variableIds: src.variables.map((v) => v.id),
          tree: manifest.manuscript,
          trash: manifest.trash,
          beatIds: src.map.boxes.filter((b) => b.kind === 'beat').map((b) => b.id),
          entryIds: src.codexIds,
          mechanicIds: src.mechanicIds,
        }),
        variables: src.variables,
        conversations: [...conversations.values()],
      },
    },
  }
}

/** Route tags of an item, live or trashed (the tree and the trash both keep them). */
function routesOf(src: GameGatherSource, id: string): Pick<GameCheckItem, 'routes'> {
  const routes =
    findNode(src.manifest.manuscript, id)?.routes ?? src.manifest.trash.find((t) => t.id === id)?.routes
  return routes?.length ? { routes } : {}
}
