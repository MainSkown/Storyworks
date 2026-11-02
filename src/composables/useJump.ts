import { ref } from 'vue'
import type { ResolveResult } from '../project/links'
import { useCodexStore } from '../codex/store'
import { useProjectStore } from '../project/store'
import { useTimelinesStore } from '../timeline/store'
import { writeView } from './writeView'

export type JumpResult = { ok: true } | Extract<ResolveResult, { ok: false }>

export interface JumpDeps {
  resolve: (item: string, block: string, side: 'to' | 'from') => ResolveResult
  goTo: (route: 'write' | 'timelines') => Promise<void>
  selectTimeline: (id: string) => void
  selectNode: (id: string) => void
  showEditor: () => void
  selectScene: (id: string) => void
  revealBlock: (sceneId: string, blockId: string) => void
}

export function createJump(deps: JumpDeps) {
  /** Set by a node jump; the timeline canvas takes it once it has the node on screen. */
  const pendingNode = ref<{ timelineId: string; nodeId: string } | null>(null)

  function fail(r: ResolveResult): JumpResult | null {
    return r.ok ? null : r
  }

  return {
    pendingNode,
    /** Consumes the pending node jump when it matches; true = the caller should centre on it. */
    takePendingNode(timelineId: string, nodeId: string): boolean {
      const p = pendingNode.value
      if (!p || p.timelineId !== timelineId || p.nodeId !== nodeId) return false
      pendingNode.value = null
      return true
    },
    async toNode(timelineId: string, nodeId: string): Promise<JumpResult> {
      const bad = fail(deps.resolve(timelineId, nodeId, 'to'))
      if (bad) return bad
      deps.selectTimeline(timelineId)
      deps.selectNode(nodeId)
      pendingNode.value = { timelineId, nodeId }
      await deps.goTo('timelines')
      return { ok: true }
    },
    async toBlock(sceneId: string, blockId: string): Promise<JumpResult> {
      const bad = fail(deps.resolve(sceneId, blockId, 'from'))
      if (bad) return bad
      deps.showEditor()
      deps.selectScene(sceneId)
      await deps.goTo('write')
      deps.revealBlock(sceneId, blockId)
      return { ok: true }
    },
  }
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

let revealTimer: ReturnType<typeof setInterval> | undefined

/** Waits for the scene to load and the block to render, then scrolls to it and flashes it. */
function revealBlock(sceneId: string, blockId: string): void {
  clearInterval(revealTimer)
  const project = useProjectStore()
  const started = Date.now()
  revealTimer = setInterval(() => {
    if (Date.now() - started > 4000 || project.selectedId !== sceneId) {
      clearInterval(revealTimer)
      return
    }
    const el = document.querySelector<HTMLElement>(`.ProseMirror [data-id="${CSS.escape(blockId)}"]`)
    if (!el) return
    clearInterval(revealTimer)
    const calm = reducedMotion()
    el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
    if (calm) {
      el.style.outline = '2px solid var(--focus-ring)'
      setTimeout(() => el.style.removeProperty('outline'), 1600)
    } else {
      el.animate(
        [{ backgroundColor: 'var(--bg-selected)' }, { backgroundColor: 'transparent' }],
        { duration: 1600, easing: 'ease-out' },
      )
    }
  }, 50)
}

const jump = createJump({
  resolve: (item, block, side) => useProjectStore().resolveLinkTarget(item, block, side),
  goTo: async (route) => {
    // Imported lazily: the router pulls in the views that use this composable.
    const { router } = await import('../router')
    await router.push({ name: route })
  },
  selectTimeline: (id) => useTimelinesStore().select(id),
  selectNode: (id) => useTimelinesStore().selectNode(id),
  showEditor: () => {
    writeView.value = 'editor'
  },
  selectScene: (id) => {
    const p = useProjectStore()
    p.openNote(null)
    p.selectedId = id
  },
  revealBlock,
})

export const pendingNodeJump = jump.pendingNode
export const takePendingNodeJump = jump.takePendingNode
/** Jumps to a timeline node: Timelines section, node selected and centred. Never navigates when broken. */
export const jumpToNode = jump.toNode
/** Jumps to a scene block: Write editor, block scrolled into view and highlighted. Never navigates when broken. */
export const jumpToBlock = jump.toBlock

/** Opens the Codex section with the entry selected. Never navigates when the entry is gone; false = refused. */
export async function jumpToEntry(entryId: string): Promise<boolean> {
  if (!useProjectStore().linkIndex()?.isLive(entryId)) return false
  useCodexStore().select(entryId)
  const { router } = await import('../router')
  await router.push({ name: 'codex' })
  return true
}

/** Opens a scene in the Write editor (no block). Never navigates when the scene is gone; false = refused. */
export async function jumpToScene(sceneId: string): Promise<boolean> {
  const p = useProjectStore()
  if (!p.linkIndex()?.isLive(sceneId)) return false
  writeView.value = 'editor'
  p.openNote(null)
  p.selectedId = sceneId
  const { router } = await import('../router')
  await router.push({ name: 'write' })
  return true
}

export function useJump() {
  return { jumpToNode, jumpToBlock, pendingNodeJump, takePendingNodeJump }
}
