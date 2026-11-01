import { addCodexLink } from '../project/links'
import type { CodexEntry } from '../project/schemas/codexEntry'
import { useProjectStore } from '../project/store'
import type { ManuscriptNode } from '../project/schemas/manifest'
import { blockIds } from '../project/schemas/scene'
import { findNode } from '../project/tree'
import { findMentions, type Mention, type MentionScene } from './mentions'

export type MentionRefusal = 'read-only' | 'unknown-entry' | 'failed'
export type LinkMentionsResult =
  { ok: true; added: number; skipped: number } | { ok: false; reason: MentionRefusal }

/** Live scenes in reading order with their current text (unsaved edits included); unreadable scenes are left out. */
async function loadScenes(only?: ReadonlySet<string>): Promise<MentionScene[]> {
  const store = useProjectStore()
  const nodes: ManuscriptNode[] = []
  const walk = (list: ManuscriptNode[]) => {
    for (const n of list) {
      if (n.type === 'scene' && n.path && (!only || only.has(n.id))) nodes.push(n)
      walk(n.children)
    }
  }
  walk(store.tree)
  const loaded = await Promise.all(nodes.map((n) => store.loadScene(n.path as string)))
  return loaded.flatMap((r, i) => (r.ok ? [{ id: nodes[i].id, content: r.value.content }] : []))
}

/** Unlinked, not-dismissed passages naming the entry. `sceneIds` limits the scan (e.g. the scene just saved). */
export async function scanMentions(
  entry: Pick<CodexEntry, 'id' | 'name' | 'aliases'>,
  sceneIds?: readonly string[],
): Promise<Mention[]> {
  const store = useProjectStore()
  const ix = store.linkIndex()
  const links = ix ? [...ix.byOwner().values()].flat() : []
  const scenes = await loadScenes(sceneIds ? new Set(sceneIds) : undefined)
  return findMentions(entry, scenes, links, store.ignoredIds)
}

/**
 * Links each mention's block to its entry (one `codex` link per block and entry, saved through the
 * scene file like event links). Blocks that are gone or already linked count as skipped. Nothing is
 * written when an entry is not listed.
 */
export async function linkMentions(mentions: readonly Mention[]): Promise<LinkMentionsResult> {
  const store = useProjectStore()
  if (store.readOnly) return { ok: false, reason: 'read-only' }
  const ix = store.linkIndex()
  if (!ix) return { ok: false, reason: 'failed' }
  if (mentions.some((m) => !ix.isLive(m.entryId))) return { ok: false, reason: 'unknown-entry' }

  const byScene = new Map<string, Mention[]>()
  for (const m of mentions) byScene.set(m.sceneId, [...(byScene.get(m.sceneId) ?? []), m])

  let added = 0
  let skipped = 0
  for (const [sceneId, list] of byScene) {
    const node = findNode(store.tree, sceneId)
    const cur = node?.path ? await store.loadScene(node.path) : null
    if (!cur?.ok) return { ok: false, reason: 'failed' }
    const blocks = new Set(blockIds(cur.value.content))
    let sceneAdded = 0
    let sceneSkipped = 0
    const ok = await store.updateSceneLinks(sceneId, (links) => {
      sceneAdded = sceneSkipped = 0
      let next = links
      for (const m of list) {
        const r = !blocks.has(m.blockId)
          ? null
          : addCodexLink(next, { sceneId, blockId: m.blockId, entryId: m.entryId })
        if (r?.link) {
          next = r.links
          sceneAdded++
        } else sceneSkipped++
      }
      return next
    })
    if (!ok) return { ok: false, reason: 'failed' }
    added += sceneAdded
    skipped += sceneSkipped
  }
  return { ok: true, added, skipped }
}

export const linkMention = (m: Mention) => linkMentions([m])

type Outcome = { ok: true } | { ok: false; reason: MentionRefusal }

async function setIgnored(m: Mention, on: boolean): Promise<Outcome> {
  const store = useProjectStore()
  if (store.readOnly) return { ok: false, reason: 'read-only' }
  const ok = await (on ? store.ignoreFinding(m.id) : store.unignoreFinding(m.id))
  return ok ? { ok: true } : { ok: false, reason: 'failed' }
}

/** "Not this one": the mention stops being offered. */
export const ignoreMention = (m: Mention) => setIgnored(m, true)
export const unignoreMention = (m: Mention) => setIgnored(m, false)
