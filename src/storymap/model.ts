import { extractLines } from '../game/playthrough'
import type { StoryModel, StoryResolved } from '../game/storyPlaythrough'
import type { Conversation } from '../project/schemas/conversation'
import type { StoryMap } from '../project/schemas/storyMap'
import type { Variable } from '../project/schemas/variables'
import { gameItems } from './items'

/** The slice of the project store the model needs (kept narrow so tests stay small). */
export interface ModelSource {
  manifest: Parameters<typeof gameItems>[0]
  loadConversation(id: string): Promise<{ ok: true; value: Conversation } | { ok: false }>
  loadScriptLines(id: string): Promise<ReturnType<typeof extractLines> | null>
}

/** Loads every live script and conversation once, so a play-through runs without waiting on files. */
export async function buildStoryModel(
  src: ModelSource,
  map: StoryMap,
  variables: readonly Variable[],
): Promise<StoryModel> {
  const resolved = new Map<string, StoryResolved>()
  await Promise.all(
    gameItems(src.manifest).map(async (item) => {
      if (item.trashed) return void resolved.set(item.id, { kind: 'trashed', title: item.title })
      if (item.type === 'conversation') {
        const r = await src.loadConversation(item.id)
        if (r.ok) resolved.set(item.id, { kind: 'conversation', title: item.title, conversation: r.value })
        return
      }
      const lines = await src.loadScriptLines(item.id)
      if (lines) resolved.set(item.id, { kind: 'script', title: item.title, lines })
    }),
  )
  return { map, variables, resolve: (id) => resolved.get(id) ?? { kind: 'missing' } }
}
