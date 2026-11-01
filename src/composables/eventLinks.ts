import { formatDate } from '../calendar'
import { describeEntry } from '../codex/pick'
import { useCodexStore } from '../codex/store'
import { linkTargetMissing } from '../project/linkProblems'
import { addCodexLink, addLink, CODEX_KIND, relinkTarget, removeLink, type Link } from '../project/links'
import { useProjectStore } from '../project/store'
import { describeTarget } from '../timeline/pick'
import { useTimelinesStore } from '../timeline/store'
import { summarizeBlockLinks, type BlockLinkInfo } from '../editor/eventLinks'

export type LinkRefusal = 'read-only' | 'failed'

export type LinkSelectionResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; reason: LinkRefusal }

export interface BlockLink {
  link: Link
  kind: 'event' | 'entry'
  /** Either end is gone: the event (or its timeline) or entry, or the passage itself. */
  broken: boolean
  /** An event link whose event side is gone, so it can be relinked. */
  eventMissing: boolean
  /** A codex link whose entry is gone (deleted or trashed), so it can be relinked. */
  entryMissing: boolean
  /** Event links only; null when the event is gone. */
  target: { timelineName: string; title: string; date: string } | null
  /** Codex links only; null when the entry is gone. An empty name = unnamed or unreadable entry. */
  entry: { id: string; name: string; typeName: string | null; typeColor: string | null } | null
}

/** Adds one link per block via `add`; blocks that already have it are skipped. */
async function linkBlocks(
  sceneId: string,
  blockIds: readonly string[],
  add: (links: readonly Link[], block: string) => { links: Link[]; link: Link | null },
): Promise<LinkSelectionResult> {
  const store = useProjectStore()
  if (store.readOnly) return { ok: false, reason: 'read-only' }
  let added = 0
  let skipped = 0
  const ok = await store.updateSceneLinks(sceneId, (links) => {
    added = skipped = 0
    let next = links
    for (const block of new Set(blockIds)) {
      const r = add(next, block)
      if (r.link) {
        next = r.links
        added++
      } else skipped++
    }
    return next
  })
  return ok ? { ok: true, added, skipped } : { ok: false, reason: 'failed' }
}

/** Links one event to every block in `blockIds` (one link each); blocks already linked to it are skipped. */
export const linkSelectionToNode = (
  sceneId: string,
  blockIds: readonly string[],
  timelineId: string,
  nodeId: string,
): Promise<LinkSelectionResult> =>
  linkBlocks(sceneId, blockIds, (links, block) =>
    addLink(links, { from: { item: sceneId, block }, to: { item: timelineId, block: nodeId } }),
  )

/** Links one codex entry to every block in `blockIds`; blocks already linked to it are skipped. */
export const linkSelectionToEntry = (
  sceneId: string,
  blockIds: readonly string[],
  entryId: string,
): Promise<LinkSelectionResult> =>
  linkBlocks(sceneId, blockIds, (links, block) => addCodexLink(links, { sceneId, blockId: block, entryId }))

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

/** Points an existing codex link at another entry. Refused when the block already links to it. */
export async function relinkLinkToEntry(
  linkId: string,
  entryId: string,
): Promise<{ ok: boolean; reason?: LinkRefusal | 'duplicate' }> {
  const store = useProjectStore()
  if (store.readOnly) return { ok: false, reason: 'read-only' }
  const owner = ownerOf(linkId)
  if (!owner) return { ok: false, reason: 'failed' }
  let duplicate = false
  const ok = await store.updateSceneLinks(owner, (links) => {
    const r = relinkTarget(links, linkId, { item: entryId })
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
  const codex = useCodexStore()
  const fmt = (d: Parameters<typeof formatDate>[1]) => formatDate(timelines.calendar, d)
  return index
    .linksFrom(sceneId)
    .filter((l) => l.from.block === blockId)
    .map((link): BlockLink => {
      const passageBroken = index.isPassageBroken(link)
      if (link.kind === CODEX_KIND) {
        const entryMissing = index.isBroken(link)
        const found = entryMissing ? null : describeEntry(codex.entries, codex.types, link.to.item)
        const entry = entryMissing
          ? null
          : { id: link.to.item, ...(found ?? { name: '', typeName: null, typeColor: null }) }
        return {
          link, kind: 'entry', broken: entryMissing || passageBroken,
          eventMissing: false, entryMissing, target: null, entry,
        }
      }
      const target = index.isBroken(link)
        ? null
        : describeTarget(timelines.loadedTimelines, link.to, fmt)
      const eventMissing = target === null
      return {
        link, kind: 'event', broken: eventMissing || passageBroken,
        eventMissing, entryMissing: false, target, entry: null,
      }
    })
}

/** Counts and broken flag per linked block of a scene, for the margin markers. Reactive. */
export function blockLinkInfoMap(sceneId: string): Map<string, BlockLinkInfo> {
  const store = useProjectStore()
  void store.linkRevision
  const index = store.linkIndex()
  if (!index) return new Map()
  const timelines = useTimelinesStore().loadedTimelines
  const noDate = () => ''
  return summarizeBlockLinks(index.linksFrom(sceneId), (l) =>
    linkTargetMissing(l, {
      isBroken: index.isBroken,
      nodeExists: (x) => describeTarget(timelines, x.to, noDate) !== null,
    }),
  )
}
