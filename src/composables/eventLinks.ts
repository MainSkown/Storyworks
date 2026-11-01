import { formatDate } from '../calendar'
import { addLink, relinkTarget, removeLink, type Link } from '../project/links'
import { useProjectStore } from '../project/store'
import { describeTarget } from '../timeline/pick'
import { useTimelinesStore } from '../timeline/store'
import type { BlockLinkInfo } from '../editor/eventLinks'

export type LinkRefusal = 'read-only' | 'failed'

export type LinkSelectionResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; reason: LinkRefusal }

export interface BlockLink {
  link: Link
  /** Either end is gone: the event (or its timeline) or the passage itself. */
  broken: boolean
  /** The event side is gone, so the link can be relinked. */
  eventMissing: boolean
  /** Null when the event is gone. */
  target: { timelineName: string; title: string; date: string } | null
}

/** Links one event to every block in `blockIds` (one link each); blocks already linked to it are skipped. */
export async function linkSelectionToNode(
  sceneId: string,
  blockIds: readonly string[],
  timelineId: string,
  nodeId: string,
): Promise<LinkSelectionResult> {
  const store = useProjectStore()
  if (store.readOnly) return { ok: false, reason: 'read-only' }
  let added = 0
  let skipped = 0
  const ok = await store.updateSceneLinks(sceneId, (links) => {
    added = skipped = 0
    let next = links
    for (const block of new Set(blockIds)) {
      const r = addLink(next, {
        from: { item: sceneId, block },
        to: { item: timelineId, block: nodeId },
      })
      if (r.link) {
        next = r.links
        added++
      } else skipped++
    }
    return next
  })
  return ok ? { ok: true, added, skipped } : { ok: false, reason: 'failed' }
}

function ownerOf(linkId: string): string | null {
  const index = useProjectStore().linkIndex()
  if (!index) return null
  for (const [owner, links] of index.byOwner()) if (links.some((l) => l.id === linkId)) return owner
  return null
}

/** Removes one link (also the repair "Remove"). */
export async function unlinkLink(linkId: string): Promise<{ ok: boolean; reason?: LinkRefusal }> {
  const store = useProjectStore()
  if (store.readOnly) return { ok: false, reason: 'read-only' }
  const owner = ownerOf(linkId)
  if (!owner) return { ok: false, reason: 'failed' }
  const ok = await store.updateSceneLinks(owner, (links) => removeLink(links, linkId))
  return ok ? { ok: true } : { ok: false, reason: 'failed' }
}

/** Points an existing link at another event. Refused when the block already links to it. */
export async function relinkLink(
  linkId: string,
  timelineId: string,
  nodeId: string,
): Promise<{ ok: boolean; reason?: LinkRefusal | 'duplicate' }> {
  const store = useProjectStore()
  if (store.readOnly) return { ok: false, reason: 'read-only' }
  const owner = ownerOf(linkId)
  if (!owner) return { ok: false, reason: 'failed' }
  let duplicate = false
  const ok = await store.updateSceneLinks(owner, (links) => {
    const r = relinkTarget(links, linkId, { item: timelineId, block: nodeId })
    duplicate = r.reason === 'duplicate'
    return r.links
  })
  if (duplicate) return { ok: false, reason: 'duplicate' }
  return ok ? { ok: true } : { ok: false, reason: 'failed' }
}

/** The links of one block with display data. Reactive: reads the link revision. */
export function linksForBlock(sceneId: string, blockId: string): BlockLink[] {
  const store = useProjectStore()
  void store.linkRevision
  const index = store.linkIndex()
  if (!index) return []
  const timelines = useTimelinesStore()
  const fmt = (d: Parameters<typeof formatDate>[1]) => formatDate(timelines.calendar, d)
  return index
    .linksFrom(sceneId)
    .filter((l) => l.from.block === blockId)
    .map((link) => {
      const target = index.isBroken(link)
        ? null
        : describeTarget(timelines.loadedTimelines, link.to, fmt)
      const eventMissing = target === null
      return { link, broken: eventMissing || index.isPassageBroken(link), eventMissing, target }
    })
}

/** Count and broken flag per linked block of a scene, for the margin markers. Reactive. */
export function blockLinkInfoMap(sceneId: string): Map<string, BlockLinkInfo> {
  const store = useProjectStore()
  void store.linkRevision
  const out = new Map<string, BlockLinkInfo>()
  const index = store.linkIndex()
  if (!index) return out
  const timelines = useTimelinesStore().loadedTimelines
  const noDate = () => ''
  for (const l of index.linksFrom(sceneId)) {
    if (l.from.block === undefined) continue
    const broken = index.isBroken(l) || describeTarget(timelines, l.to, noDate) === null
    const cur = out.get(l.from.block)
    out.set(l.from.block, { count: (cur?.count ?? 0) + 1, broken: (cur?.broken ?? false) || broken })
  }
  return out
}
