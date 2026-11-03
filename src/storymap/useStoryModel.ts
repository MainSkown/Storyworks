import { extractLines } from '../game/playthrough'
import type { StoryModel } from '../game/storyPlaythrough'
import { useProjectStore } from '../project/store'
import { findNode } from '../project/tree'
import { useVariablesStore } from '../variables/store'
import { buildStoryModel } from './model'
import { useStoryMapStore } from './store'

/** Builds a play-through model from the open project (unsaved edits included). */
export function useStoryModel(): { build(): Promise<StoryModel> } {
  const project = useProjectStore()
  const storyMap = useStoryMapStore()
  const vars = useVariablesStore()

  async function build(): Promise<StoryModel> {
    const manifest = project.project?.manifest
    return buildStoryModel(
      {
        manifest: manifest ?? { manuscript: [], trash: [] },
        loadConversation: project.loadConversation,
        loadScriptLines: async (id) => {
          const path = manifest ? findNode(manifest.manuscript, id)?.path : undefined
          if (!path) return null
          const r = await project.loadScene(path)
          return r.ok ? extractLines(r.value.content) : null
        },
      },
      storyMap.map,
      vars.variables,
    )
  }
  return { build }
}
