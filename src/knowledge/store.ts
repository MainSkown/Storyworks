import { computed, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { newId } from '../project/ids'
import {
  brokenAbout,
  brokenLearnings,
  knowledgeEventCountAtNode,
  knowledgePath,
  learningsAtNode as atNode,
  learningsOfEntry as ofEntry,
  loadKnowledge,
  validateLearning,
  type ForgottenBeforeLearned,
  type LearningCheck,
} from '../project/knowledge'
import type { ItemStatus } from '../project/rules'
import {
  KNOWLEDGE_VERSION,
  knowledgeItemSchema,
  type KnowledgeItem,
  type Learning,
} from '../project/schemas/knowledge'
import { parseFile } from '../project/serialize'
import { useProjectStore } from '../project/store'
import type { FileError } from '../project/types'
import { useCodexStore } from '../codex/store'
import { useRulesStore } from '../rules/store'

/** One listed file, in manifest order. `status` is not 'ok' for files the UI shows as "invalid file" / "missing". */
export interface ListEntry {
  id: string
  path: string
  title: string
  status: ItemStatus
  error?: FileError
}

export type ItemPatch = Partial<Pick<KnowledgeItem, 'title' | 'description' | 'tags' | 'about'>>
export type NewItem = Pick<KnowledgeItem, 'title'> &
  Partial<Pick<KnowledgeItem, 'description' | 'tags' | 'about'>>
export type NewLearning = Pick<Learning, 'entryId' | 'at'> &
  Partial<Pick<Learning, 'note' | 'forgottenAt' | 'revealedIn'>>
export type LearningPatch = Partial<Omit<Learning, 'id'>>

type Rejection =
  | Extract<LearningCheck, { ok: false }>['reason']
  | 'read-only'
  | 'unknown-item'
  | 'unknown-learning'
export type ItemOutcome =
  { ok: true } | { ok: false; reason: 'read-only' | 'unknown-item' | 'empty-title' | 'unknown' }
export type AddLearningOutcome = { ok: true; id: string } | { ok: false; reason: Rejection }
export type LearningOutcome = { ok: true } | { ok: false; reason: Rejection }

const clean = (s: string) => s.trim()

export const useKnowledgeStore = defineStore('knowledge', () => {
  const projectStore = useProjectStore()
  const codex = useCodexStore()
  const rulesStore = useRulesStore()

  const itemDocs = shallowRef(new Map<string, KnowledgeItem>())
  const itemList = shallowRef<ListEntry[]>([])
  const statuses = new Map<string, { status: ItemStatus; error?: FileError }>()
  const seen = new Map<string, number>()

  const readOnly = computed(() => projectStore.readOnly)
  /** Readable items in manifest order. */
  const items = computed(() => [...itemDocs.value.values()])
  /** Ids of listed codex entries (trashed or deleted ones are not listed). */
  const liveEntryIds = computed(() => new Set(codex.entryList.map((e) => e.id)))
  const liveRuleIds = computed(() => new Set(rulesStore.ruleEntries.map((e) => e.id)))
  /** Learnings whose learner entry is trashed or missing. */
  const brokenLearningIds = computed(() => brokenLearnings(items.value, liveEntryIds.value))
  /** Items whose rule or entry (`about`) is trashed or missing. */
  const brokenAboutIds = computed(() =>
    brokenAbout(items.value, liveEntryIds.value, liveRuleIds.value),
  )

  // ---- loading ----

  function rebuildList(): void {
    itemList.value = (projectStore.project?.manifest.knowledge ?? []).map((r) => {
      const st = statuses.get(r.id) ?? { status: 'ok' as const }
      return {
        id: r.id,
        path: r.path,
        title: r.title ?? '',
        status: st.status,
        ...(st.error ? { error: st.error } : {}),
      }
    })
  }

  function reseedVersions(): void {
    seen.clear()
    for (const e of itemList.value) seen.set(e.path, projectStore.itemVersion(e.path))
  }

  /** Reads everything again (after open, or after project.json was reloaded). */
  async function load(): Promise<void> {
    const p = projectStore.project
    if (!p) return reset()
    const l = await loadKnowledge(p)
    itemDocs.value = l.items
    statuses.clear()
    for (const [id, status] of l.status) statuses.set(id, { status, error: l.errors.get(id) })
    rebuildList()
    reseedVersions()
  }

  function reset(): void {
    itemDocs.value = new Map()
    itemList.value = []
    statuses.clear()
    seen.clear()
  }

  async function rereadOne(id: string, path: string): Promise<void> {
    const p = projectStore.project
    if (!p) return
    const text = await p.io.readText(path)
    const r = text === null ? null : parseFile(knowledgeItemSchema, text, path)
    const docs = new Map(itemDocs.value)
    if (r?.ok && r.value.id === id) {
      docs.set(id, r.value)
      statuses.set(id, { status: 'ok' })
    } else {
      docs.delete(id)
      statuses.set(
        id,
        r
          ? {
              status: 'invalid',
              error: r.ok
                ? { file: path, field: 'id', message: 'id does not match project.json' }
                : r.error,
            }
          : { status: 'missing' },
      )
    }
    // keep manifest order
    const refs = projectStore.project?.manifest.knowledge ?? []
    itemDocs.value = new Map(
      refs.flatMap((ref) => (docs.has(ref.id) ? [[ref.id, docs.get(ref.id)!] as const] : [])),
    )
    rebuildList()
  }

  // Files changed on disk (the project store reloads them and bumps their version).
  watch(
    () => itemList.value.map((e) => [e.id, e.path, projectStore.itemVersion(e.path)] as const),
    async (now) => {
      for (const [id, path, version] of now) {
        if (seen.get(path) === version) continue
        seen.set(path, version)
        await rereadOne(id, path)
      }
    },
  )

  /** Files written by this store are known; the watcher must not read them back. */
  const markSeen = (path: string) => seen.set(path, projectStore.itemVersion(path))

  // ---- items ----

  /** New item at the end of the list. null = refused (read-only, empty title). */
  async function createItem(o: NewItem): Promise<string | null> {
    const p = projectStore.project
    const title = clean(o.title)
    if (!p || p.readOnly || !title) return null
    const item = knowledgeItemSchema.parse({
      version: KNOWLEDGE_VERSION,
      id: newId(),
      title,
      ...(o.description ? { description: o.description } : {}),
      ...(o.tags ? { tags: o.tags } : {}),
      ...(o.about ? { about: o.about } : {}),
    })
    const path = knowledgePath(item.id)
    await p.saveItem(path, knowledgeItemSchema, item)
    statuses.set(item.id, { status: 'ok' })
    itemDocs.value = new Map(itemDocs.value).set(item.id, item)
    projectStore.setKnowledgeRefs({
      knowledge: [...p.manifest.knowledge, { id: item.id, path, title }],
    })
    rebuildList()
    markSeen(path)
    return item.id
  }

  /** Saves `next` and keeps the manifest title in step. false = refused (read-only or invalid file). */
  function commitItem(next: KnowledgeItem): boolean {
    const p = projectStore.project
    const path = itemList.value.find((e) => e.id === next.id)?.path
    if (!p || !path || !projectStore.updateItem(path, knowledgeItemSchema, next)) return false
    const prev = itemDocs.value.get(next.id)
    itemDocs.value = new Map(itemDocs.value).set(next.id, next)
    if (prev && prev.title !== next.title)
      projectStore.setKnowledgeRefs({
        knowledge: p.manifest.knowledge.map((r) =>
          r.id === next.id ? { ...r, title: next.title } : r,
        ),
      })
    rebuildList()
    return true
  }

  function updateItem(id: string, patch: ItemPatch): ItemOutcome {
    const item = itemDocs.value.get(id)
    if (projectStore.readOnly) return { ok: false, reason: 'read-only' }
    if (!item) return { ok: false, reason: 'unknown-item' }
    const title = patch.title === undefined ? item.title : clean(patch.title)
    if (!title) return { ok: false, reason: 'empty-title' }
    return commitItem({ ...item, ...patch, title })
      ? { ok: true }
      : { ok: false, reason: 'read-only' }
  }

  /** Plain delete (no trash): the ref goes, then the file. Scene links to it then show as broken. */
  async function deleteItem(id: string): Promise<ItemOutcome> {
    const p = projectStore.project
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    const path = itemList.value.find((e) => e.id === id)?.path
    if (!path) return { ok: false, reason: 'unknown-item' }
    const next = new Map(itemDocs.value)
    next.delete(id)
    itemDocs.value = next
    statuses.delete(id)
    projectStore.setKnowledgeRefs({ knowledge: p.manifest.knowledge.filter((r) => r.id !== id) })
    rebuildList()
    try {
      await projectStore.flush() // the manifest is saved before the file goes
      await projectStore.removeUnlistedFile(path)
    } catch (e) {
      console.error('Could not remove the knowledge file', e)
      return { ok: false, reason: 'unknown' }
    }
    return { ok: true }
  }

  // ---- learnings ----

  const rejected = (reason: Rejection) => ({ ok: false as const, reason })

  /** New learning at the end of the item's list. Refuses a missing learner and (via `isForgottenBeforeLearned`) forgetting before learning. */
  function addLearning(
    itemId: string,
    input: NewLearning,
    isForgottenBeforeLearned?: ForgottenBeforeLearned,
  ): AddLearningOutcome {
    if (projectStore.readOnly) return rejected('read-only')
    const item = itemDocs.value.get(itemId)
    if (!item) return rejected('unknown-item')
    const learning: Learning = {
      id: newId(),
      entryId: input.entryId,
      at: input.at,
      note: input.note ?? '',
      forgottenAt: input.forgottenAt ?? null,
      revealedIn: input.revealedIn ?? null,
    }
    const check = validateLearning(
      learning,
      { entryIds: liveEntryIds.value },
      isForgottenBeforeLearned,
    )
    if (!check.ok) return check
    return commitItem({ ...item, learnings: [...item.learnings, learning] })
      ? { ok: true, id: learning.id }
      : rejected('read-only')
  }

  /** The learner is re-checked only when it changes, so a broken learning stays editable. */
  function updateLearning(
    itemId: string,
    learningId: string,
    patch: LearningPatch,
    isForgottenBeforeLearned?: ForgottenBeforeLearned,
  ): LearningOutcome {
    if (projectStore.readOnly) return rejected('read-only')
    const item = itemDocs.value.get(itemId)
    if (!item) return rejected('unknown-item')
    const learning = item.learnings.find((l) => l.id === learningId)
    if (!learning) return rejected('unknown-learning')
    const next: Learning = { ...learning, ...patch }
    const entryIds =
      next.entryId === learning.entryId ? new Set([next.entryId]) : liveEntryIds.value
    const check = validateLearning(next, { entryIds }, isForgottenBeforeLearned)
    if (!check.ok) return check
    return commitItem({
      ...item,
      learnings: item.learnings.map((l) => (l.id === learningId ? next : l)),
    })
      ? { ok: true }
      : rejected('read-only')
  }

  function removeLearning(itemId: string, learningId: string): LearningOutcome {
    if (projectStore.readOnly) return rejected('read-only')
    const item = itemDocs.value.get(itemId)
    if (!item) return rejected('unknown-item')
    if (!item.learnings.some((l) => l.id === learningId)) return rejected('unknown-learning')
    return commitItem({ ...item, learnings: item.learnings.filter((l) => l.id !== learningId) })
      ? { ok: true }
      : rejected('read-only')
  }

  const learningsOfEntry = (entryId: string) => ofEntry(items.value, entryId)
  const learningsAtNode = (timelineId: string, nodeId: string) =>
    atNode(items.value, timelineId, nodeId)
  /** Learn + forget events at the node; 0 hides its marker. */
  const eventCountAtNode = (timelineId: string, nodeId: string) =>
    knowledgeEventCountAtNode(items.value, timelineId, nodeId)

  return {
    readOnly,
    items,
    itemList,
    brokenLearningIds,
    brokenAboutIds,
    load,
    reset,
    createItem,
    updateItem,
    deleteItem,
    addLearning,
    updateLearning,
    removeLearning,
    learningsOfEntry,
    learningsAtNode,
    eventCountAtNode,
  }
})
