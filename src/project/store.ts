import { computed, ref, shallowRef, triggerRef } from 'vue'
import { defineStore } from 'pinia'
import type { z } from 'zod'
import { createAutosaver, type Autosaver, type SaveStatus } from './autosave'
import { createChangeWatcher, type ChangeWatcher } from './changeWatcher'
import { newId } from './ids'
import { coverage, type Coverage } from './coverage'
import {
  brokenByDeletingNode,
  brokenByDeletingScenes,
  brokenByDeletingTimeline,
  sceneIdsUnder,
} from './deleteImpact'
import { createLinkIndex, EVENT_KIND, type LinkIndex, type ResolveResult } from './links'
import { findRehomes } from './rehome'
import { createProjectLock, type ProjectLock } from './lock'
import { MANIFEST_FILE } from './migrations'
import { createProject, defaultEnv, openProject, readOnlyReasonOf } from './open'
import { createProjectIO } from './io'
import { countWords, rollUp } from '../editor/wordCount'
import { elementsOfDoc } from '../editor/screenplay/elements'
import type { ScriptElement } from '../editor/screenplay/layout'
import { scriptPageStats } from './pageStats'
import { sceneHeadingIds, sceneNumbers } from './sceneNumbers'
import { appendNoteToScene, noteToSceneContent } from './inbox'
import { commentIdsIn } from '../editor/comments'
import { addImage } from './assets'
import { findNode, moveTo } from './tree'
import { isTauri } from './pickFolder'
import { defaultExportOptions, type ExportOptions } from '../export/options'
import { defaultScriptExportOptions, type ScriptExportOptions } from '../export/scriptOptions'
import {
  exportSettingsSchema,
  scriptExportSchema,
  dictionariesSchema,
  goalsSchema,
  MANIFEST_VERSION,
  peekManifestHeader,
  type BookMeta,
  type Manifest,
  type ManuscriptNode,
} from './schemas/manifest'
import {
  addIgnored,
  emptyIgnored,
  ignoredIds,
  ignoredSchema,
  removeIgnored,
  type Ignored,
} from './schemas/ignored'
import { emptyStats, statsSchema, type Stats } from './schemas/stats'
import { INBOX_VERSION, inboxSchema, type Inbox, type InboxNote } from './schemas/inbox'
import { blockIds, sceneSchema, SCENE_VERSION, type Scene } from './schemas/scene'
import type { TrashedNode } from './schemas/trashedNode'
import { NodeRestoreError } from './trash'
import { parseFile } from './serialize'
import { useSettingsStore } from '../settings/store'
import { log } from '../safety/log'
import { findLatestAutoBackup, restoreLatestBackupRaw } from '../safety/rawRestore'
import { startBackupScheduler, type BackupScheduler } from '../history/backups'
import { useCodexStore } from '../codex/store'
import { useRelationsStore } from '../relations/store'
import { useRulesStore } from '../rules/store'
import { useStatesStore } from '../states/store'
import { useKnowledgeStore } from '../knowledge/store'
import { useStatsStore } from '../stats/store'
import { useTimelinesStore } from '../timeline/store'
import { seedCodexTypes } from './codex'
import { seedRelationTypes } from './relations'
import { seedRuleCategories } from './rules'
import { seedStateKinds } from './states'
import { ensureDefaults } from './timelines'
import type {
  ChangeEvent,
  FileError,
  Issue,
  LockEnv,
  LockInfo,
  OpenProject,
  OpenResult,
  ParseResult,
  ProjectIO,
  ReloadResult,
  TrashEntry,
} from './types'

/** What the tree needs to know about a scene, kept in memory so it never reads files per render. */
export interface SceneMeta {
  status: Scene['status']
  synopsis: string
  povId: string | undefined
  wordCount: number
  /** ids of the revision to-dos not done yet (for the open-to-do check) */
  openTodoIds: string[]
  /** scene heading block ids in document order (screenplay scene numbers) */
  headingIds: string[]
  /** screenplay elements in order (page count); empty for books */
  elements: ScriptElement[]
  /** cheap change test for `elements` */
  elementsKey: string
}

function elementsMeta(sc: Scene): Pick<SceneMeta, 'elements' | 'elementsKey'> {
  const elements = elementsOfDoc(sc.content).map(({ type, text }) => ({ type, text }))
  return { elements, elementsKey: elements.map((e) => `${e.type}:${e.text}`).join('\u0000') }
}

const metaOfScene = (sc: Scene): SceneMeta => ({
  ...elementsMeta(sc),
  status: sc.status,
  synopsis: sc.synopsis,
  povId: sc.povId,
  wordCount: sc.wordCount,
  openTodoIds: sc.todos.filter((t) => !t.done).map((t) => t.id),
  headingIds: sceneHeadingIds(sc.content),
})

let ioFactory: (root: string) => ProjectIO = createProjectIO
export function setProjectIOFactory(factory: (root: string) => ProjectIO): void {
  ioFactory = factory
}
export function resetProjectIOFactory(): void {
  ioFactory = createProjectIO
}

export type OpenError =
  /** root is set when the book was being opened (not reloaded), so a backup restore can be offered. */
  | { kind: 'refused'; reason: 'invalid-json' | 'invalid-schema'; error: FileError; root?: string }
  | { kind: 'migration-failed'; message: string }
  | { kind: 'failed'; message: string }

export interface LockPrompt {
  holder: LockInfo
  rootPath: string
}

export type LockNote = 'took-over-stale' | 'lost'
export type OpenOutcome = 'opened' | 'needs-choice' | 'failed'

const browserLockEnv = (): LockEnv => ({
  now: () => Date.now(),
  machine: () => 'browser',
  pid: () => 1,
  processAlive: async (pid) => pid === 1,
})

async function lockEnv(): Promise<LockEnv> {
  if (!isTauri()) return browserLockEnv()
  return (await import('./lockEnv')).createTauriLockEnv()
}

/** Folder of a project, given the folder or its project.json. */
export function projectFolder(input: string): string {
  return input
    .trim()
    .replace(/[\\/]+$/, '')
    .replace(/(^|[\\/])project\.json$/, '')
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ---- manifest tree helpers (immutable: the UI sees a new array on every change) ----

function findFirst(
  nodes: ManuscriptNode[],
  test: (n: ManuscriptNode) => boolean,
): ManuscriptNode | null {
  for (const n of nodes) {
    if (test(n)) return n
    const inner = findFirst(n.children, test)
    if (inner) return inner
  }
  return null
}

function mapNode(
  nodes: ManuscriptNode[],
  id: string,
  fn: (n: ManuscriptNode) => ManuscriptNode,
): ManuscriptNode[] {
  return nodes.map((n) => (n.id === id ? fn(n) : { ...n, children: mapNode(n.children, id, fn) }))
}

/** Swaps the node with its neighbour; null when it is already at the edge or not found. */
function moveNode(nodes: ManuscriptNode[], id: string, delta: -1 | 1): ManuscriptNode[] | null {
  const i = nodes.findIndex((n) => n.id === id)
  if (i >= 0) {
    const j = i + delta
    if (j < 0 || j >= nodes.length) return null
    const copy = [...nodes]
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
    return copy
  }
  for (const [k, n] of nodes.entries()) {
    const inner = moveNode(n.children, id, delta)
    if (inner) return nodes.map((x, idx) => (idx === k ? { ...x, children: inner } : x))
  }
  return null
}

function liveIds(m: Manifest): Set<string> {
  const ids = new Set<string>()
  const walk = (nodes: ManuscriptNode[]) => {
    for (const n of nodes) {
      ids.add(n.id)
      walk(n.children)
    }
  }
  walk(m.manuscript)
  const lists = [
    m.timelines,
    m.rules,
    m.ruleCategories,
    m.codexTypes,
    m.codexEntries,
    m.relationTypes,
    m.relationships,
    m.groups,
    m.stateKinds,
    m.knowledge,
  ]
  for (const ref of [m.calendar, m.inbox, m.ignoredFindings, m.stats, m.relationLayout, ...lists.flat()]) {
    if (ref) ids.add(ref.id)
  }
  return ids
}

interface Pending {
  schema: z.ZodType<never>
  value: unknown
}

/** Everything that belongs to one open project and is not reactive UI state. */
interface Session {
  io: ProjectIO
  lock: ProjectLock | null
  autosaver: Autosaver
  watcher: ChangeWatcher
  index: LinkIndex
  /** item id (scene or timeline) -> block / node ids it holds; absent = unknown */
  blocks: Map<string, Set<string>>
  /** latest unsaved value per item path */
  pending: Map<string, Pending>
  touched: Set<string>
  detach: Array<() => void>
  /** automatic backups; null for read-only books */
  backup: BackupScheduler | null
}

export const useProjectStore = defineStore('project', () => {
  const project = shallowRef<OpenProject | null>(null)
  const rootPath = ref<string | null>(null)
  const issues = ref<Issue[]>([])
  const saveStatus = ref<SaveStatus>('saved')
  const openError = ref<OpenError | null>(null)
  const lockPrompt = ref<LockPrompt | null>(null)
  const lockNote = ref<LockNote | null>(null)
  const externalPrompts = ref<{ path: string }[]>([])
  const manifestChanged = ref(false)
  /** bumped whenever the manifest content changes (its arrays are replaced, not edited) */
  const revision = ref(0)
  const linkRevision = ref(0)
  /** bumped when a project has finished opening (all content stores loaded) */
  const openedCount = ref(0)
  const epoch = ref(0)
  const itemVersions = ref<Record<string, number>>({})
  /** scene id -> metadata; mutated in place, then triggerRef (cheap for hundreds of scenes) */
  const sceneMeta = shallowRef(new Map<string, SceneMeta>())
  const selectedId = ref<string | null>(null)
  /** inbox note shown in the centre pane (instead of a scene) */
  const openNoteId = ref<string | null>(null)
  /** latest inbox state, including edits not saved yet; replaced, never edited */
  const inbox = shallowRef<Inbox | null>(null)
  /** dismissed finding ids (ignored.json), including edits not saved yet; replaced, never edited */
  const ignored = shallowRef<Ignored | null>(null)
  /** writing stats (stats.json), including edits not saved yet; replaced, never edited */
  const stats = shallowRef<Stats | null>(null)

  const readOnly = computed(() => project.value?.readOnly ?? null)
  const tree = computed<ManuscriptNode[]>(() => {
    void revision.value
    return project.value?.manifest.manuscript ?? []
  })
  const trash = computed<TrashEntry[]>(() => {
    void revision.value
    return project.value?.manifest.trash ?? []
  })
  const inboxNotes = computed<InboxNote[]>(() => inbox.value?.notes ?? [])
  const inboxInvalid = computed(() => {
    void revision.value
    const path = project.value?.manifest.inbox?.path
    return !!path && issues.value.some((i) => i.kind === 'invalid' && i.path === path)
  })
  const ignoredIdSet = computed(() => ignoredIds(ignored.value))
  const ignoredInvalid = computed(() => {
    void revision.value
    const path = project.value?.manifest.ignoredFindings?.path
    return !!path && issues.value.some((i) => i.kind === 'invalid' && i.path === path)
  })
  const statsInvalid = computed(() => {
    void revision.value
    const path = project.value?.manifest.stats?.path
    return !!path && issues.value.some((i) => i.kind === 'invalid' && i.path === path)
  })
  /** Words per node id (containers sum their scenes); the book total is under ''. */
  const wordCounts = computed(() => {
    const counts = new Map<string, number>()
    for (const [id, m] of sceneMeta.value) counts.set(id, m.wordCount)
    return rollUp(tree.value, counts)
  })
  /** Screenplay scene numbers: heading block id and item id to number (empty when no headings). */
  const sceneNumbering = computed(() => {
    const ids = new Map<string, string[]>()
    for (const [id, m] of sceneMeta.value) if (m.headingIds.length) ids.set(id, m.headingIds)
    return sceneNumbers(tree.value, ids)
  })
  /** Screenplay pages and runtime, laid out like the PDF export (zero for other kinds). */
  const pageStats = computed(() => {
    void revision.value // scriptExport lives in the manifest
    const m = project.value?.manifest
    if (!m || m.kind !== 'screenplay') return { pages: 0, minutes: 0 }
    return scriptPageStats(tree.value, (id) => sceneMeta.value.get(id)?.elements, {
      pageSize: m.scriptExport.pageSize,
      language: m.language,
      moreContd: m.scriptExport.moreContd,
    })
  })
  const brokenLinkCount = computed(() => {
    void revision.value
    void linkRevision.value
    return project.value && session ? session.index.brokenLinks().length : 0
  })

  let session: Session | null = null
  let pendingOpen: { io: ProjectIO; root: string } | null = null
  const ignoredUnlisted = new Set<string>()

  // ---- status ----

  function refreshStatus(): void {
    const s = session
    if (!s) {
      saveStatus.value = 'saved'
      return
    }
    for (const p of s.touched) if (!s.autosaver.isDirty(p)) s.touched.delete(p)
    if (s.autosaver.status === 'error') {
      if (saveStatus.value !== 'error') log.error('save.failed')
      saveStatus.value = 'error'
    }
    else if (s.autosaver.status === 'saving' || s.touched.size > 0) saveStatus.value = 'saving'
    else saveStatus.value = 'saved'
  }

  function mark(path: string): void {
    if (!session) return
    session.touched.add(path)
    session.autosaver.markDirty(path)
    refreshStatus()
  }

  const isBlocked = (path: string) =>
    externalPrompts.value.some((p) => p.path === path) ||
    (path === MANIFEST_FILE && manifestChanged.value)

  // ---- issues ----

  const nodeIdOfPath = (path: string) =>
    findFirst(project.value?.manifest.manuscript ?? [], (n) => n.path === path)?.id ??
    (project.value?.manifest.inbox?.path === path ? project.value.manifest.inbox.id : null) ??
    (project.value?.manifest.ignoredFindings?.path === path
      ? project.value.manifest.ignoredFindings.id
      : null) ??
    (project.value?.manifest.stats?.path === path ? project.value.manifest.stats.id : null) ??
    project.value?.manifest.timelines.find((t) => t.path === path)?.id ??
    project.value?.manifest.rules.find((r) => r.path === path)?.id ??
    project.value?.manifest.ruleCategories.find((r) => r.path === path)?.id ??
    project.value?.manifest.codexEntries.find((r) => r.path === path)?.id ??
    project.value?.manifest.codexTypes.find((r) => r.path === path)?.id ??
    project.value?.manifest.relationTypes.find((r) => r.path === path)?.id ??
    project.value?.manifest.relationships.find((r) => r.path === path)?.id ??
    project.value?.manifest.groups.find((r) => r.path === path)?.id ??
    project.value?.manifest.stateKinds.find((r) => r.path === path)?.id ??
    project.value?.manifest.knowledge.find((r) => r.path === path)?.id ??
    (project.value?.manifest.relationLayout?.path === path
      ? project.value.manifest.relationLayout.id
      : null) ??
    path

  function setItemIssue(path: string, res: ReloadResult): void {
    const rest = issues.value.filter(
      (i) => !((i.kind === 'missing' || i.kind === 'invalid') && i.path === path),
    )
    const itemId = nodeIdOfPath(path)
    if (res.status === 'missing') rest.push({ kind: 'missing', itemId, path })
    else if (res.status === 'invalid')
      rest.push({ kind: 'invalid', itemId, path, error: res.error })
    issues.value = rest
  }

  function bumpItem(path: string): void {
    itemVersions.value = { ...itemVersions.value, [path]: (itemVersions.value[path] ?? 0) + 1 }
  }

  // ---- links ----

  async function readScene(io: ProjectIO, path: string): Promise<ParseResult<Scene> | null> {
    const text = await io.readText(path)
    return text === null ? null : parseFile(sceneSchema, text, path)
  }

  /** Sets or drops one index entry; true when something changed. Callers trigger. */
  function putMeta(id: string, scene: Scene | null): boolean {
    const map = sceneMeta.value
    if (!scene) return map.delete(id)
    const next = metaOfScene(scene)
    const cur = map.get(id)
    if (
      cur &&
      cur.status === next.status &&
      cur.synopsis === next.synopsis &&
      cur.povId === next.povId &&
      cur.wordCount === next.wordCount &&
      cur.openTodoIds.join('\n') === next.openTodoIds.join('\n') &&
      cur.headingIds.join('\n') === next.headingIds.join('\n') &&
      cur.elementsKey === next.elementsKey
    )
      return false
    map.set(id, next)
    return true
  }

  async function indexScene(s: Session, id: string, path: string): Promise<void> {
    const r = await readScene(s.io, path)
    if (r?.ok) {
      s.blocks.set(id, new Set(blockIds(r.value.content)))
      s.index.setLinks(id, r.value.links)
    } else {
      s.blocks.delete(id)
      s.index.removeOwner(id)
    }
    putMeta(id, r?.ok ? r.value : null)
  }

  async function loadInbox(s: Session, p: OpenProject): Promise<void> {
    const ref = p.manifest.inbox
    inbox.value = null
    if (ref) {
      const text = await s.io.readText(ref.path)
      const r = text === null ? null : parseFile(inboxSchema, text, ref.path)
      inbox.value = r?.ok ? r.value : null
    }
    if (openNoteId.value && !inbox.value?.notes.some((n) => n.id === openNoteId.value))
      openNoteId.value = null
  }

  async function loadIgnored(s: Session, p: OpenProject): Promise<void> {
    const ref = p.manifest.ignoredFindings
    ignored.value = null
    if (!ref) return
    const text = await s.io.readText(ref.path)
    const r = text === null ? null : parseFile(ignoredSchema, text, ref.path)
    ignored.value = r?.ok ? r.value : null
  }

  async function loadStats(s: Session, p: OpenProject): Promise<void> {
    const ref = p.manifest.stats
    stats.value = null
    if (!ref) return
    const text = await s.io.readText(ref.path)
    const r = text === null ? null : parseFile(statsSchema, text, ref.path)
    stats.value = r?.ok ? r.value : null
  }

  /** Re-reads what the app keeps in memory about a file that changed on disk. */
  async function reindex(s: Session, path: string): Promise<void> {
    const p = project.value
    if (p?.manifest.inbox?.path === path) await loadInbox(s, p)
    else if (p?.manifest.ignoredFindings?.path === path) await loadIgnored(s, p)
    else if (p?.manifest.stats?.path === path) await loadStats(s, p)
    else await indexScene(s, nodeIdOfPath(path), path)
  }

  async function rebuildLinks(s: Session, p: OpenProject): Promise<void> {
    const scenes: ManuscriptNode[] = []
    const walk = (nodes: ManuscriptNode[]) => {
      for (const n of nodes) {
        if (n.type === 'scene' && n.path) scenes.push(n)
        walk(n.children)
      }
    }
    walk(p.manifest.manuscript)
    await Promise.all(scenes.map((n) => indexScene(s, n.id, n.path as string)))
    triggerRef(sceneMeta)
    linkRevision.value++
  }

  function trackLinks(): LinkIndex | null {
    void revision.value
    void linkRevision.value
    if (!project.value || !session) return null
    void session.index.revision.value
    return session.index
  }

  /** Can a jump land here? `to` = timeline node, `from` = scene block. Never navigate on `ok: false`. */
  function resolveLinkTarget(item: string, block: string, side: 'to' | 'from'): ResolveResult {
    const ix = trackLinks()
    if (!ix) return { ok: false, reason: side === 'to' ? 'missing-timeline' : 'missing-scene' }
    const ref = { item, block }
    return ix.resolveTarget({ id: '', kind: EVENT_KIND, from: ref, to: ref }, side)
  }

  /** Links that would show as broken if this scene, chapter or part were deleted. */
  function linksBrokenByDeletingItem(id: string): number {
    const ix = trackLinks()
    return ix ? brokenByDeletingScenes(ix, sceneIdsUnder(tree.value, id)) : 0
  }
  function linksBrokenByDeletingTimeline(timelineId: string): number {
    const ix = trackLinks()
    return ix ? brokenByDeletingTimeline(ix, timelineId) : 0
  }
  function linksBrokenByDeletingNode(timelineId: string, nodeId: string): number {
    const ix = trackLinks()
    return ix ? brokenByDeletingNode(ix, timelineId, nodeId) : 0
  }

  /** Nodes with no (unbroken) passage and non-empty scenes with no (unbroken) link. No UI yet (M7). */
  function coverageInfo(): Coverage {
    const ix = trackLinks()
    if (!ix) return { nodesWithoutPassages: [], scenesWithoutLinks: [] }
    return coverage({
      nodeIds: useTimelinesStore().allNodeIds,
      scenes: [...sceneMeta.value].map(([id, m]) => ({ id, wordCount: m.wordCount })),
      links: [...ix.byOwner().values()].flat(),
      isBroken: ix.isAnyBroken,
    })
  }

  // ---- session pieces ----

  function buildPieces(s: Session): void {
    s.pending = new Map()
    s.touched = new Set()
    s.blocks = new Map()
    let live: { rev: number; ids: Set<string> } | null = null
    s.index = createLinkIndex({
      blockExists: (item, block) => s.blocks.get(item)?.has(block) ?? true,
      isLive: (id) => {
        const p = project.value
        if (!p) return false
        if (live?.rev !== revision.value) live = { rev: revision.value, ids: liveIds(p.manifest) }
        return live.ids.has(id)
      },
    })
    s.autosaver = createAutosaver({
      save: async (path) => {
        const p = project.value
        if (!p || isBlocked(path)) return
        if (path === MANIFEST_FILE) return p.saveManifest()
        const entry = s.pending.get(path)
        if (!entry) return
        await p.saveItem(path, entry.schema, entry.value as never)
        if (s.pending.get(path) === entry) s.pending.delete(path)
        if ((entry.schema as unknown) === sceneSchema) await afterSceneSave(s, entry.value as Scene)
      },
      onStatusChange: refreshStatus,
    })
    s.watcher = createChangeWatcher({
      io: s.io,
      // live lookup, so reloadManifest swaps the project without a new watcher
      project: {
        get manifest() {
          return project.value?.manifest as Manifest
        },
        knownHash: (path) => project.value?.knownHash(path),
      },
      isDirty: (path) => s.pending.has(path) || s.autosaver.isDirty(path),
      reload: async (path) => {
        const res = await (project.value as OpenProject).reloadItem(path)
        s.pending.delete(path)
        setItemIssue(path, res)
        bumpItem(path)
        await reindex(s, path)
        triggerRef(sceneMeta)
        linkRevision.value++
      },
      onEvent: (e: ChangeEvent) => {
        if (e.kind === 'prompt') {
          if (!externalPrompts.value.some((p) => p.path === e.path)) {
            externalPrompts.value = [...externalPrompts.value, { path: e.path }]
          }
        } else if (e.kind === 'deleted') setItemIssue(e.path, { status: 'missing' })
        else if (e.kind === 'manifest-changed') manifestChanged.value = true
      },
    })
  }

  function unlistedFilter(list: Issue[]): Issue[] {
    return list.filter((i) => !(i.kind === 'unlisted' && ignoredUnlisted.has(i.path)))
  }

  async function attach(
    io: ProjectIO,
    root: string,
    opened: Extract<OpenResult, { status: 'ok' }>,
    lock: ProjectLock | null,
  ): Promise<void> {
    const s = { io, lock, detach: [], backup: null } as unknown as Session
    buildPieces(s)
    session = s
    project.value = opened.project
    rootPath.value = root
    issues.value = unlistedFilter(opened.issues)
    externalPrompts.value = []
    manifestChanged.value = false
    itemVersions.value = {}
    sceneMeta.value = new Map()
    selectedId.value = null
    openNoteId.value = null
    revision.value++
    saveStatus.value = 'saved'

    if (typeof window !== 'undefined') {
      const onFocus = () => void s.watcher.recheck()
      const onUnload = () => {
        void s.backup?.runOnClose() // best effort: the page may go before it finishes
        void s.lock?.release()
      }
      window.addEventListener('focus', onFocus)
      window.addEventListener('beforeunload', onUnload)
      s.detach.push(
        () => window.removeEventListener('focus', onFocus),
        () => window.removeEventListener('beforeunload', onUnload),
      )
    }
    lock?.startAutoRefresh(() => {
      lockNote.value = 'lost'
    })
    if (!opened.project.readOnly) {
      const settings = useSettingsStore()
      s.backup = startBackupScheduler({ io, env: defaultEnv, getSettings: () => settings.settings.backups, onError: (e) => log.error('backup.failed', e) })
    }
    try {
      await s.watcher.start()
    } catch (e) {
      console.error('Could not watch the project folder', e)
    }
    await loadInbox(s, opened.project)
    await loadIgnored(s, opened.project)
    await loadStats(s, opened.project)
    await rebuildLinks(s, opened.project)
    await openContent(opened.project)
    openedCount.value++
    notifyOpened(opened.project.manifest.title, root)
  }

  /** Defaults (calendar, Main timeline, rule categories, codex types; skipped when read-only), then loads timelines, rules and the codex. */
  async function openContent(p: OpenProject): Promise<void> {
    try {
      await ensureDefaults(p, defaultEnv)
    } catch (e) {
      console.error('Could not create the default calendar or timeline', e)
    }
    try {
      await seedRuleCategories(p, defaultEnv)
    } catch (e) {
      console.error('Could not create the default rule categories', e)
    }
    try {
      await seedCodexTypes(p, defaultEnv)
    } catch (e) {
      console.error('Could not create the starter codex types', e)
    }
    try {
      await seedRelationTypes(p, defaultEnv)
    } catch (e) {
      console.error('Could not create the starter relation types', e)
    }
    try {
      await seedStateKinds(p, defaultEnv)
    } catch (e) {
      console.error('Could not create the starter state kinds', e)
    }
    revision.value++
    await useTimelinesStore().load()
    await useRulesStore().load()
    await useCodexStore().load()
    await useRelationsStore().load()
    await useStatesStore().load()
    await useKnowledgeStore().load()
  }

  function notifyOpened(title: string, path: string): void {
    // Recent list lives in the settings store. Never let it break opening.
    try {
      useSettingsStore().addRecentProject({ path, title })
    } catch (e) {
      console.error('Could not update the recent projects list', e)
    }
  }

  // ---- open / close ----

  async function finishOpen(
    io: ProjectIO,
    root: string,
    lock: ProjectLock | null,
    forceReadOnly?: 'locked-elsewhere',
  ): Promise<OpenOutcome> {
    const r = await openProject(io, defaultEnv, forceReadOnly ? { forceReadOnly } : {})
    if (r.status === 'refused') {
      log.error('open.refused', { code: r.reason })
      await lock?.release()
      openError.value = { kind: 'refused', reason: r.reason, error: r.error, root }
      return 'failed'
    }
    if (r.status === 'migration-failed') {
      log.error('migrate.failed')
      await lock?.release()
      openError.value = { kind: 'migration-failed', message: r.error }
      return 'failed'
    }
    await attach(io, root, r, lock)
    log.info('book.opened')
    return 'opened'
  }

  /** Accepts the project folder or its project.json. */
  async function open(input: string): Promise<OpenOutcome> {
    await close()
    const root = projectFolder(input)
    try {
      const io = ioFactory(root)
      const text = await io.readText(MANIFEST_FILE)
      const header = text === null ? null : peekManifestHeader(text)
      // No lock for read-only files or files we cannot read; openProject reports those.
      if (header === null || readOnlyReasonOf(header) !== null) {
        return await finishOpen(io, root, null)
      }
      const lock = createProjectLock(io, await lockEnv())
      const res = await lock.acquire()
      if (res.status === 'held-elsewhere') {
        pendingOpen = { io, root }
        lockPrompt.value = { holder: res.holder, rootPath: root }
        return 'needs-choice'
      }
      lockNote.value = res.tookOverStale ? 'took-over-stale' : null
      return await finishOpen(io, root, lock)
    } catch (e) {
      log.error('open.failed', e)
      openError.value = { kind: 'failed', message: message(e) }
      return 'failed'
    }
  }

  /** Is there an automatic backup to restore into a book that would not open? */
  const hasBackupFor = async (root: string): Promise<boolean> =>
    !!(await findLatestAutoBackup(ioFactory(root)).catch(() => null))

  /** Replaces the files of a book whose project.json is unusable with the latest automatic backup, then opens it. */
  async function restoreUnopenable(root: string): Promise<OpenOutcome> {
    await restoreLatestBackupRaw(ioFactory(root), defaultEnv)
    log.info('restore.from-backup')
    openError.value = null
    return open(root)
  }

  async function resolveLockPrompt(
    choice: 'readOnly' | 'cancel',
  ): Promise<'opened' | 'failed' | 'cancelled'> {
    const ctx = pendingOpen
    pendingOpen = null
    lockPrompt.value = null
    if (!ctx || choice === 'cancel') return 'cancelled'
    try {
      const text = await ctx.io.readText(MANIFEST_FILE)
      const version = text === null ? null : peekManifestHeader(text)?.version
      if (version != null && version < MANIFEST_VERSION) {
        openError.value = {
          kind: 'migration-failed',
          message: 'This project needs an upgrade, which cannot happen while it is open elsewhere.',
        }
        return 'failed'
      }
      return (await finishOpen(ctx.io, ctx.root, null, 'locked-elsewhere')) as 'opened' | 'failed'
    } catch (e) {
      openError.value = { kind: 'failed', message: message(e) }
      return 'failed'
    }
  }

  async function create(root: string, meta: BookMeta): Promise<OpenOutcome> {
    await close()
    const folder = projectFolder(root)
    try {
      await createProject(ioFactory(folder), meta)
    } catch (e) {
      openError.value = { kind: 'failed', message: message(e) }
      return 'failed'
    }
    return open(folder)
  }

  async function close(): Promise<void> {
    pendingOpen = null
    lockPrompt.value = null
    const s = session
    session = null
    if (s) {
      try {
        await s.autosaver.flushAll()
      } catch (e) {
        console.error(e)
      }
      s.autosaver.dispose()
      await s.backup?.runOnClose().catch((e) => console.error(e))
      s.backup?.stop()
      await s.watcher.stop().catch(() => {})
      s.detach.forEach((fn) => fn())
      await s.lock?.release().catch(() => {})
    }
    project.value = null
    rootPath.value = null
    issues.value = []
    saveStatus.value = 'saved'
    openError.value = null
    lockNote.value = null
    externalPrompts.value = []
    manifestChanged.value = false
    itemVersions.value = {}
    sceneMeta.value = new Map()
    selectedId.value = null
    openNoteId.value = null
    inbox.value = null
    ignored.value = null
    stats.value = null
    useStatsStore().reset()
    useTimelinesStore().reset()
    useRulesStore().reset()
    useCodexStore().reset()
    useRelationsStore().reset()
    useStatesStore().reset()
    useKnowledgeStore().reset()
    ignoredUnlisted.clear()
    revision.value++
    linkRevision.value++
  }

  /** Saves everything pending now. */
  /** The open book's file access (history and backups work on it directly); null when none is open. */
  function projectIO(): ProjectIO | null {
    return session?.io ?? null
  }

  async function flush(): Promise<void> {
    await session?.autosaver.flushAll()
    refreshStatus()
  }

  // ---- items ----

  function assertWritable(): OpenProject {
    const p = project.value
    if (!p || !session) throw new Error('No project is open')
    if (p.readOnly) throw new Error(`Project is read-only (${p.readOnly.reason})`)
    return p
  }

  /** Records the latest value and schedules a save. false = refused (read-only, invalid file, no project). */
  function updateItem<T>(path: string, schema: z.ZodType<T>, value: T): boolean {
    const p = project.value
    const s = session
    if (!p || !s || p.readOnly || p.isInvalid(path)) return false
    s.pending.set(path, { schema: schema as z.ZodType<never>, value })
    if ((schema as unknown) === sceneSchema) {
      const scene = value as Scene
      s.index.setLinks(scene.id, scene.links)
      linkRevision.value++
      if (putMeta(scene.id, scene)) triggerRef(sceneMeta)
    }
    mark(path)
    return true
  }

  async function loadScene(path: string): Promise<ParseResult<Scene>> {
    const unsaved = session?.pending.get(path)
    if (unsaved) return { ok: true, value: unsaved.value as Scene }
    if (!session) return { ok: false, error: { file: path, message: 'No project is open' } }
    const r = await readScene(session.io, path)
    return r ?? { ok: false, error: { file: path, message: `${path} not found` } }
  }

  function itemVersion(path: string): number {
    return epoch.value + (itemVersions.value[path] ?? 0)
  }

  async function resolveExternal(path: string, choice: 'reload' | 'keep'): Promise<void> {
    const s = session
    const p = project.value
    if (!s || !p) return
    externalPrompts.value = externalPrompts.value.filter((x) => x.path !== path)
    if (choice === 'keep') {
      if (s.pending.has(path)) mark(path)
      return
    }
    s.pending.delete(path)
    setItemIssue(path, await p.reloadItem(path))
    bumpItem(path)
    await reindex(s, path)
    triggerRef(sceneMeta)
    linkRevision.value++
    refreshStatus()
  }

  // ---- structure ----

  function setManuscript(next: ManuscriptNode[]): void {
    const p = assertWritable()
    p.manifest.manuscript = next
    revision.value++
    mark(MANIFEST_FILE)
  }

  /** `init` fills the scene at creation (import); unlike setSceneContent it does not count as writing progress. */
  async function addScene(
    parentId: string | null,
    title = 'New scene',
    init?: { content: Scene['content']; wordCount: number },
  ): Promise<string> {
    const p = assertWritable()
    const manuscript = p.manifest.manuscript
    if (parentId !== null) {
      const parent = findNode(manuscript, parentId)
      if (!parent || parent.type === 'scene')
        throw new Error(`Cannot add a scene under ${parentId}`)
    }
    const id = newId()
    const path = `manuscript/${id}.json`
    const scene = sceneSchema.parse({
      version: SCENE_VERSION,
      id,
      title,
      content: init?.content ?? { type: 'doc', content: [] },
      wordCount: init?.wordCount ?? 0,
    })
    await p.saveItem(path, sceneSchema, scene)
    if (session && putMeta(id, scene)) triggerRef(sceneMeta)
    const node: ManuscriptNode = { id, type: 'scene', title, path, children: [] }
    setManuscript(
      parentId === null
        ? [...manuscript, node]
        : mapNode(manuscript, parentId, (n) => ({ ...n, children: [...n.children, node] })),
    )
    return id
  }

  function addContainer(type: 'part' | 'chapter', parentId: string | null, title: string): string {
    const p = assertWritable()
    const manuscript = p.manifest.manuscript
    const parent = parentId === null ? null : findNode(manuscript, parentId)
    if (parentId !== null && !parent) throw new Error(`Unknown parent ${parentId}`)
    if (type === 'part' ? parent : parent && parent.type !== 'part')
      throw new Error(`Cannot add a ${type} under ${parentId}`)
    const node: ManuscriptNode = { id: newId(), type, title, children: [] }
    setManuscript(
      parent
        ? mapNode(manuscript, parent.id, (n) => ({ ...n, children: [...n.children, node] }))
        : [...manuscript, node],
    )
    return node.id
  }

  async function addPart(title = 'New part'): Promise<string> {
    return addContainer('part', null, title)
  }

  /** At the root, or inside the given part. */
  async function addChapter(
    parentId: string | null = null,
    title = 'New chapter',
  ): Promise<string> {
    return addContainer('chapter', parentId, title)
  }

  /** Re-nests or reorders. `index` is the final position among the new parent's children. false = invalid move. */
  async function moveItem(id: string, parentId: string | null, index: number): Promise<boolean> {
    const p = assertWritable()
    const next = moveTo(p.manifest.manuscript, id, parentId, index)
    if (!next) return false
    setManuscript(next)
    return true
  }

  // Scene read-modify-write steps run one after another, so none overwrites another's result.
  let patchQueue: Promise<unknown> = Promise.resolve()

  /** Applies a change to one scene file (autosaved). false = not a usable scene or refused. */
  function patchScene(id: string, change: (scene: Scene) => Scene): Promise<boolean> {
    const p = assertWritable()
    const run = async (): Promise<boolean> => {
      const node = findNode(p.manifest.manuscript, id)
      if (!node || node.type !== 'scene' || !node.path || p.isInvalid(node.path)) return false
      const cur = await loadScene(node.path)
      if (!cur.ok) return false
      return updateItem(node.path, sceneSchema, change({ ...cur.value }))
    }
    const result = patchQueue.then(run)
    patchQueue = result.catch(() => undefined)
    return result
  }

  /** Replaces the scene's links with `change(links)` (autosaved). false = refused or not a usable scene. */
  function updateSceneLinks(
    id: string,
    change: (links: Scene['links']) => Scene['links'],
  ): Promise<boolean> {
    return patchScene(id, (sc) => ({ ...sc, links: change(sc.links) }))
  }

  /** The link index, or null with no project open. Read `linkRevision` to react to changes. */
  function linkIndex(): LinkIndex | null {
    return session?.index ?? null
  }

  /** Records the saved scene's block ids, then moves links whose block now lives in another scene. */
  async function afterSceneSave(s: Session, scene: Scene): Promise<void> {
    s.blocks.set(scene.id, new Set(blockIds(scene.content)))
    const p = project.value
    if (!p) return
    const { moves, dupes } = findRehomes({
      links: s.index.byOwner(),
      blocks: s.blocks,
      isLive: s.index.isLive,
    })
    if (moves.length === 0 && dupes.length === 0) {
      linkRevision.value++
      return
    }
    // Serial with patchScene; destination is written before the source loses the link.
    const rewrite = async (id: string, change: (links: Scene['links']) => Scene['links']) => {
      const node = findNode(p.manifest.manuscript, id)
      if (!node?.path || p.isInvalid(node.path)) return
      const cur = await loadScene(node.path)
      if (!cur.ok) return
      const next = { ...cur.value, links: change(cur.value.links) }
      await p.saveItem(node.path, sceneSchema, next)
      if (s.pending.has(node.path))
        s.pending.set(node.path, { schema: sceneSchema as never, value: next })
      s.index.setLinks(id, next.links)
    }
    const run = async () => {
      for (const m of moves) {
        await rewrite(m.to, (ls) => (ls.some((l) => l.id === m.link.id) ? ls : [...ls, m.link]))
        await rewrite(m.from, (ls) => ls.filter((l) => l.id !== m.link.id))
      }
      for (const d of dupes) await rewrite(d.owner, (ls) => ls.filter((l) => l.id !== d.linkId))
    }
    const result = patchQueue.then(run)
    patchQueue = result.catch(() => undefined)
    await result.catch((e) => console.error('Could not move links with their text', e))
    linkRevision.value++
  }

  /** Lets the timelines store report which node ids a timeline holds (for broken-link checks). */
  function setBlockIds(itemId: string, ids: Iterable<string> | null): void {
    if (!session) return
    if (ids) session.blocks.set(itemId, new Set(ids))
    else session.blocks.delete(itemId)
    linkRevision.value++
  }

  /** Writes status, synopsis and/or POV (null clears it) to the scene file (autosaved). false = refused. */
  function setSceneMeta(
    id: string,
    patch: { status?: Scene['status']; synopsis?: string; povId?: string | null },
  ): Promise<boolean> {
    return patchScene(id, (sc) => {
      if (patch.povId === null) delete sc.povId
      else if (patch.povId !== undefined) sc.povId = patch.povId
      if (patch.status !== undefined) sc.status = patch.status
      if (patch.synopsis !== undefined) sc.synopsis = patch.synopsis
      return sc
    })
  }

  /**
   * Stores the editor content and its word count; other scene fields stay as they are.
   * This is the only path for real edits, so the writing stats are fed from here (not from loads).
   */
  async function setSceneContent(
    id: string,
    content: Scene['content'],
    wordCount: number,
  ): Promise<boolean> {
    let delta = 0
    const ok = await patchScene(id, (sc) => {
      delta = wordCount - sc.wordCount
      return { ...sc, content, wordCount }
    })
    if (ok) {
      try {
        await useStatsStore().recordEdit(delta)
      } catch (e) {
        console.error('Could not record writing stats', e)
      }
    }
    return ok
  }

  /** Drops comments whose mark left the text. Run when leaving a scene, so undo can still bring one back. */
  function pruneSceneComments(id: string): Promise<boolean> {
    return patchScene(id, (sc) => {
      const live = commentIdsIn(sc.content)
      const comments = sc.comments.filter((c) => live.has(c.id))
      return comments.length === sc.comments.length ? sc : { ...sc, comments }
    })
  }

  /** Adds a comment body; the editor puts the matching mark on the text. */
  function addSceneComment(id: string, comment: { id: string; text: string }): Promise<boolean> {
    return patchScene(id, (sc) => ({
      ...sc,
      comments: [
        ...sc.comments,
        {
          id: comment.id,
          text: comment.text,
          createdAt: new Date().toISOString(),
          resolved: false,
        },
      ],
    }))
  }

  /** Edits a comment's text and/or resolved flag. false = refused or no such comment. */
  async function updateSceneComment(
    id: string,
    commentId: string,
    patch: { text?: string; resolved?: boolean },
  ): Promise<boolean> {
    let found = false
    const ok = await patchScene(id, (sc) => ({
      ...sc,
      comments: sc.comments.map((c) => {
        if (c.id !== commentId) return c
        found = true
        return { ...c, ...patch }
      }),
    }))
    return ok && found
  }

  /** Removes the comment body; the editor removes the mark. */
  function deleteSceneComment(id: string, commentId: string): Promise<boolean> {
    return patchScene(id, (sc) => ({
      ...sc,
      comments: sc.comments.filter((c) => c.id !== commentId),
    }))
  }

  /** Copies image bytes to assets/ and returns the relative path. */
  async function addAsset(bytes: Uint8Array, ext: string): Promise<string> {
    assertWritable()
    return addImage((session as Session).io, bytes, ext, newId)
  }

  /** Bytes of a project file (null = missing), e.g. an image. */
  async function readAsset(path: string): Promise<Uint8Array | null> {
    return session ? session.io.readBytes(path) : null
  }

  /** Replaces the scene's revision checklist (autosaved). false = refused. */
  function setSceneTodos(id: string, todos: Scene['todos']): Promise<boolean> {
    return patchScene(id, (sc) => ({ ...sc, todos }))
  }

  async function rename(id: string, title: string): Promise<void> {
    const p = assertWritable()
    const name = title.trim()
    const node = findNode(p.manifest.manuscript, id)
    if (!node || name === '' || name === node.title) return
    setManuscript(mapNode(p.manifest.manuscript, id, (n) => ({ ...n, title: name })))
    if (node.type === 'scene') await patchScene(id, (sc) => ({ ...sc, title: name }))
  }

  /** Swaps the item with its neighbour under the same parent. false = already at the edge. */
  async function moveUpDown(id: string, dir: 'up' | 'down'): Promise<boolean> {
    const p = assertWritable()
    const next = moveNode(p.manifest.manuscript, id, dir === 'up' ? -1 : 1)
    if (!next) return false
    setManuscript(next)
    return true
  }

  async function deleteItem(id: string): Promise<TrashEntry> {
    const p = assertWritable()
    const s = session as Session
    await flush() // never write to a file that is about to move
    const entry = await p.deleteItem(id)
    const gone = p.manifest.trash.filter((t) => t.deletedAt === entry.deletedAt)
    for (const t of gone) {
      s.index.removeOwner(t.id)
      putMeta(t.id, null)
      s.pending.delete(t.originalPath)
    }
    const goneIds = new Set(gone.map((t) => t.id))
    triggerRef(sceneMeta)
    if (selectedId.value && goneIds.has(selectedId.value)) selectedId.value = null
    issues.value = issues.value.filter(
      (i) => !((i.kind === 'missing' || i.kind === 'invalid') && goneIds.has(i.itemId)),
    )
    revision.value++
    return entry
  }

  async function restoreItem(id: string): Promise<{ skippedEdges: number } | void> {
    const p = assertWritable()
    const s = session as Session
    if (p.manifest.trash.some((t) => t.id === id && t.type === 'node')) {
      const r = await useTimelinesStore().restoreNode(id)
      if (!r.ok) throw new NodeRestoreError(r.reason, `Cannot restore ${id}: ${r.reason}`)
      return { skippedEdges: r.skippedEdges }
    }
    if (p.manifest.trash.some((t) => t.id === id && t.type === 'rule')) {
      await useRulesStore().restoreRule(id)
      return
    }
    if (p.manifest.trash.some((t) => t.id === id && t.type === 'entry')) {
      await useCodexStore().restoreEntry(id)
      return
    }
    if (p.manifest.trash.some((t) => t.id === id && t.type === 'note')) return restoreNote(id)
    if (p.manifest.trash.some((t) => t.id === id && t.type === 'timeline')) {
      await p.restoreTimeline(id)
      revision.value++
      return useTimelinesStore().refresh()
    }
    await p.restoreItem(id)
    revision.value++
    const node = findNode(p.manifest.manuscript, id)
    if (node?.path) {
      if (await s.io.exists(node.path)) await indexScene(s, id, node.path)
      else setItemIssue(node.path, { status: 'missing' })
      triggerRef(sceneMeta)
    }
    linkRevision.value++
  }

  // ---- check settings ----

  /** A check with no saved setting is enabled. */
  function isCheckEnabled(id: string): boolean {
    void revision.value // the manifest object is not reactive
    return project.value?.manifest.checkSettings[id] !== false
  }

  function setCheckEnabled(id: string, enabled: boolean): void {
    const p = assertWritable()
    p.manifest.checkSettings = { ...p.manifest.checkSettings, [id]: enabled }
    revision.value++
    mark(MANIFEST_FILE)
  }

  // ---- title, author, title page ----

  const bookInfo = computed(() => {
    void revision.value // the manifest object is not reactive
    const m = project.value?.manifest
    return {
      title: m?.title ?? '',
      author: m?.author ?? '',
      contact: m?.titlePage.contact ?? '',
      date: m?.titlePage.date ?? '',
    }
  })

  /** false (nothing changed) when the title is blank or the project is read-only. */
  function setBookInfo(next: { title: string; author: string; contact: string; date: string }): boolean {
    const p = project.value
    const title = next.title.trim()
    if (!p || !session || p.readOnly || !title) return false
    p.manifest.title = title
    p.manifest.author = next.author.trim()
    p.manifest.titlePage = { contact: next.contact.trim(), date: next.date.trim() }
    revision.value++
    mark(MANIFEST_FILE)
    return true
  }

  // ---- writing goals ----

  const goals = computed(() => {
    void revision.value // the manifest object is not reactive
    return project.value?.manifest.goals ?? { daily: null, book: null }
  })

  /** null = no goal. false (nothing changed) when invalid or the project is read-only. */
  function setGoals(next: { daily: number | null; book: number | null }): boolean {
    const p = project.value
    if (!p || !session || p.readOnly) return false
    const r = goalsSchema.safeParse(next)
    if (!r.success) return false
    p.manifest.goals = r.data
    revision.value++
    mark(MANIFEST_FILE)
    return true
  }

  // ---- spellcheck dictionary selection ----

  /** The book's own selection (name + scope); empty = nothing chosen yet. */
  const dictionaries = computed(() => {
    void revision.value // the manifest object is not reactive
    return project.value?.manifest.dictionaries ?? []
  })

  /** false (nothing changed) when invalid or the project is read-only. */
  function setDictionaries(next: { name: string; scope: 'local' | 'global' }[]): boolean {
    const p = project.value
    if (!p || !session || p.readOnly) return false
    const r = dictionariesSchema.safeParse(next)
    if (!r.success) return false
    p.manifest.dictionaries = r.data
    revision.value++
    mark(MANIFEST_FILE)
    return true
  }

  // ---- export settings ----

  const exportSettings = computed<ExportOptions>(() => {
    void revision.value // the manifest object is not reactive
    return project.value?.manifest.exportSettings ?? defaultExportOptions()
  })

  /** Validates and saves; returns false (nothing changed) when the value is invalid. */
  function setExportSettings(next: ExportOptions): boolean {
    const p = assertWritable()
    const r = exportSettingsSchema.safeParse(next)
    if (!r.success) return false
    p.manifest.exportSettings = r.data
    revision.value++
    mark(MANIFEST_FILE)
    return true
  }

  const scriptExport = computed<ScriptExportOptions>(() => {
    void revision.value
    return project.value?.manifest.scriptExport ?? defaultScriptExportOptions()
  })

  /** Validates and saves; returns false (nothing changed) when the value is invalid. */
  function setScriptExport(next: ScriptExportOptions): boolean {
    const p = assertWritable()
    const r = scriptExportSchema.safeParse(next)
    if (!r.success) return false
    p.manifest.scriptExport = r.data
    revision.value++
    mark(MANIFEST_FILE)
    return true
  }

  // ---- timelines (the timelines store holds the content) ----

  /** Replaces the manifest's timeline list (create, rename). */
  function setTimelineRefs(next: Manifest['timelines']): void {
    const p = assertWritable()
    p.manifest.timelines = next
    revision.value++
    mark(MANIFEST_FILE)
  }

  async function trashTimeline(id: string, title: string): Promise<TrashEntry> {
    const p = assertWritable()
    await flush() // never write to a file that is about to move
    const entry = await p.trashTimeline(id, title)
    session?.pending.delete(entry.originalPath)
    issues.value = issues.value.filter(
      (i) => !((i.kind === 'missing' || i.kind === 'invalid') && i.itemId === id),
    )
    revision.value++
    return entry
  }

  // ---- rules (the rules store holds the content) ----

  /** Replaces the manifest's rule and/or category lists (create, rename, delete category). */
  function setRuleRefs(next: { rules?: Manifest['rules']; ruleCategories?: Manifest['ruleCategories'] }): void {
    const p = assertWritable()
    if (next.rules) p.manifest.rules = next.rules
    if (next.ruleCategories) p.manifest.ruleCategories = next.ruleCategories
    revision.value++
    mark(MANIFEST_FILE)
  }

  async function trashRule(id: string, title: string): Promise<TrashEntry> {
    const p = assertWritable()
    await flush() // never write to a file that is about to move
    const entry = await p.trashRule(id, title)
    session?.pending.delete(entry.originalPath)
    issues.value = issues.value.filter(
      (i) => !((i.kind === 'missing' || i.kind === 'invalid') && i.itemId === id),
    )
    revision.value++
    return entry
  }

  /** Puts the file back and lists it. Throws RuleRestoreError; the rules store re-reads. */
  async function restoreRuleFile(id: string): Promise<void> {
    await assertWritable().restoreRule(id)
    revision.value++
  }

  // ---- codex (the codex store holds the content) ----

  /** Replaces the manifest's codex entry and/or type lists (create, rename, delete type). */
  function setCodexRefs(next: { codexEntries?: Manifest['codexEntries']; codexTypes?: Manifest['codexTypes'] }): void {
    const p = assertWritable()
    if (next.codexEntries) p.manifest.codexEntries = next.codexEntries
    if (next.codexTypes) p.manifest.codexTypes = next.codexTypes
    revision.value++
    mark(MANIFEST_FILE)
  }

  /** Replaces the manifest's relation type, relationship, group and/or layout refs. */
  function setRelationRefs(next: {
    relationTypes?: Manifest['relationTypes']
    relationships?: Manifest['relationships']
    groups?: Manifest['groups']
    relationLayout?: Manifest['relationLayout']
  }): void {
    const p = assertWritable()
    if (next.relationTypes) p.manifest.relationTypes = next.relationTypes
    if (next.relationships) p.manifest.relationships = next.relationships
    if (next.groups) p.manifest.groups = next.groups
    if (next.relationLayout !== undefined) p.manifest.relationLayout = next.relationLayout
    revision.value++
    mark(MANIFEST_FILE)
  }

  /** Replaces the manifest's state kind refs. */
  function setStateKindRefs(next: { stateKinds: Manifest['stateKinds'] }): void {
    const p = assertWritable()
    p.manifest.stateKinds = next.stateKinds
    revision.value++
    mark(MANIFEST_FILE)
  }

  /** Replaces the manifest's knowledge item refs. */
  function setKnowledgeRefs(next: { knowledge: Manifest['knowledge'] }): void {
    const p = assertWritable()
    p.manifest.knowledge = next.knowledge
    revision.value++
    mark(MANIFEST_FILE)
  }

  async function trashEntry(id: string, title: string): Promise<TrashEntry> {
    const p = assertWritable()
    await flush() // never write to a file that is about to move
    const entry = await p.trashEntry(id, title)
    session?.pending.delete(entry.originalPath)
    issues.value = issues.value.filter(
      (i) => !((i.kind === 'missing' || i.kind === 'invalid') && i.itemId === id),
    )
    revision.value++
    return entry
  }

  /** Puts the file back and lists it. Throws EntryRestoreError; the codex store re-reads. */
  async function restoreEntryFile(id: string): Promise<void> {
    await assertWritable().restoreEntry(id)
    revision.value++
  }

  /** Removes a file that is no longer listed (a deleted category). Drops its unsaved edits. */
  async function removeUnlistedFile(path: string): Promise<void> {
    const p = assertWritable()
    await flush()
    session?.pending.delete(path)
    await p.io.remove(path)
    issues.value = issues.value.filter((i) => !(i.kind !== 'unlisted' && i.path === path))
  }

  async function trashNode(item: TrashedNode): Promise<TrashEntry> {
    const entry = await assertWritable().trashNode(item)
    revision.value++
    return entry
  }

  async function dropTrashedNode(id: string): Promise<void> {
    await assertWritable().dropTrashedNode(id)
    revision.value++
  }

  // ---- ignored findings ----

  const IGNORED_FILE = 'ignored.json'
  let ignoredCreating: Promise<void> | null = null

  /** Creates ignored.json and registers it in project.json on first use. */
  async function ensureIgnored(p: OpenProject): Promise<void> {
    if (p.manifest.ignoredFindings) return
    ignoredCreating ??= (async () => {
      const empty = emptyIgnored()
      await p.saveItem(IGNORED_FILE, ignoredSchema, empty)
      p.manifest.ignoredFindings = { id: newId(), path: IGNORED_FILE }
      ignored.value = empty
      revision.value++
      mark(MANIFEST_FILE)
    })().finally(() => {
      ignoredCreating = null
    })
    await ignoredCreating
  }

  async function changeIgnored(change: (cur: Ignored) => Ignored): Promise<boolean> {
    const p = project.value
    if (!p || !session || p.readOnly) return false
    const ref = p.manifest.ignoredFindings
    if (ref && p.isInvalid(ref.path)) return false
    try {
      await ensureIgnored(p)
    } catch (e) {
      console.error('Could not create the ignored-findings file', e)
      return false
    }
    const path = (p.manifest.ignoredFindings as { path: string }).path
    const cur = ignored.value ?? emptyIgnored()
    const next = change(cur)
    if (next === cur) return true
    if (!updateItem(path, ignoredSchema, next)) return false
    ignored.value = next
    return true
  }

  /** Dismisses a finding (e.g. `mention:<entry>:<block>`); false = refused (read-only, invalid file). */
  const ignoreFinding = (id: string) => changeIgnored((cur) => addIgnored(cur, id))
  /** Brings a dismissed finding back. */
  const unignoreFinding = (id: string) => changeIgnored((cur) => removeIgnored(cur, id))

  // ---- writing stats ----

  const STATS_FILE = 'stats.json'
  let statsCreating: Promise<void> | null = null

  /** Creates stats.json and registers it in project.json on first use. */
  async function ensureStats(p: OpenProject): Promise<void> {
    if (p.manifest.stats) return
    statsCreating ??= (async () => {
      const empty = emptyStats()
      await p.saveItem(STATS_FILE, statsSchema, empty)
      p.manifest.stats = { id: newId(), path: STATS_FILE }
      stats.value = empty
      revision.value++
      mark(MANIFEST_FILE)
    })().finally(() => {
      statsCreating = null
    })
    await statsCreating
  }

  /** Replaces the stats with `change(current)` (autosaved, created on first use). false = refused (read-only, invalid file). */
  async function changeStats(change: (cur: Stats) => Stats): Promise<boolean> {
    const p = project.value
    if (!p || !session || p.readOnly) return false
    const ref = p.manifest.stats
    if (ref && p.isInvalid(ref.path)) return false
    try {
      await ensureStats(p)
    } catch (e) {
      console.error('Could not create the stats file', e)
      return false
    }
    const path = (p.manifest.stats as { path: string }).path
    const next = change(stats.value ?? emptyStats())
    if (!updateItem(path, statsSchema, next)) return false
    stats.value = next
    return true
  }

  // ---- inbox ----

  const INBOX_FILE = 'inbox.json'
  let inboxCreating: Promise<void> | null = null

  /** Creates inbox.json and registers it in project.json on first use. Throws when it cannot be written. */
  async function ensureInbox(): Promise<void> {
    const p = assertWritable()
    const ref = p.manifest.inbox
    if (ref) {
      if (p.isInvalid(ref.path)) throw new Error(`${ref.path} is invalid; not changing it`)
      return
    }
    inboxCreating ??= (async () => {
      const empty: Inbox = { version: INBOX_VERSION, id: newId(), notes: [] }
      await p.saveItem(INBOX_FILE, inboxSchema, empty)
      p.manifest.inbox = { id: empty.id, path: INBOX_FILE }
      inbox.value = empty
      revision.value++
      mark(MANIFEST_FILE)
    })().finally(() => {
      inboxCreating = null
    })
    await inboxCreating
  }

  /** The inbox to build the next state on (a listed file that is missing counts as empty). */
  function currentInbox(): Inbox {
    const ref = (project.value as OpenProject).manifest.inbox as { id: string }
    return inbox.value ?? { version: INBOX_VERSION, id: ref.id, notes: [] }
  }

  function commitInbox(next: Inbox): boolean {
    const path = project.value?.manifest.inbox?.path
    if (!path || !updateItem(path, inboxSchema, next)) return false
    inbox.value = next
    return true
  }

  function removeNote(noteId: string): void {
    const cur = currentInbox()
    commitInbox({ ...cur, notes: cur.notes.filter((n) => n.id !== noteId) })
    if (openNoteId.value === noteId) openNoteId.value = null
  }

  /** Adds an empty note (creating the inbox if needed); returns its id. */
  async function addNote(title?: string): Promise<string> {
    await ensureInbox()
    const name = title?.trim()
    const note: InboxNote = {
      id: newId(),
      ...(name ? { title: name } : {}),
      content: { type: 'doc', content: [] },
    }
    const cur = currentInbox()
    if (!commitInbox({ ...cur, notes: [...cur.notes, note] }))
      throw new Error('Cannot change the inbox')
    return note.id
  }

  /** Autosaved. An empty title removes it. false = refused (read-only, invalid file) or unknown note. */
  function updateNote(
    noteId: string,
    patch: { title?: string; content?: InboxNote['content'] },
  ): boolean {
    const cur = inbox.value
    if (!cur) return false
    let found = false
    const notes = cur.notes.map((n) => {
      if (n.id !== noteId) return n
      found = true
      const next: InboxNote = { id: n.id, content: patch.content ?? n.content }
      const title = patch.title === undefined ? n.title : patch.title.trim()
      if (title) next.title = title
      return next
    })
    return found && commitInbox({ ...cur, notes })
  }

  /** Scene with `content` and the matching word count. */
  const withContent = (sc: Scene, content: unknown): Scene => ({
    ...sc,
    content: content as Scene['content'],
    wordCount: countWords(content),
  })

  /** Appends the note to the end of the scene (fresh block ids) and removes it from the inbox. */
  async function moveNoteToScene(noteId: string, sceneId: string): Promise<boolean> {
    const p = assertWritable()
    const note = inbox.value?.notes.find((n) => n.id === noteId)
    const node = findNode(p.manifest.manuscript, sceneId)
    if (!note || !node || node.type !== 'scene' || !node.path) return false
    const ok = await patchScene(sceneId, (sc) =>
      withContent(sc, appendNoteToScene(sc.content, note.content, newId)),
    )
    if (!ok) return false
    bumpItem(node.path) // an editor showing this scene reloads it
    removeNote(noteId)
    return true
  }

  /** New scene at the end of the parent, filled from the note, which leaves the inbox. null = unknown note. */
  async function createSceneFromNote(
    noteId: string,
    parentId: string | null,
  ): Promise<string | null> {
    assertWritable()
    const note = inbox.value?.notes.find((n) => n.id === noteId)
    if (!note) return null
    const id = await addScene(parentId, note.title?.trim() || undefined)
    await patchScene(id, (sc) => withContent(sc, noteToSceneContent(note.content, newId)))
    removeNote(noteId)
    return id
  }

  async function deleteNote(noteId: string): Promise<TrashEntry> {
    const p = assertWritable()
    const notes = inbox.value?.notes ?? []
    const index = notes.findIndex((n) => n.id === noteId)
    if (index < 0) throw new Error(`Unknown note ${noteId}`)
    const entry = await p.trashNote(notes[index], index)
    removeNote(noteId)
    revision.value++
    return entry
  }

  async function restoreNote(id: string): Promise<void> {
    const p = assertWritable()
    const { note, index } = await p.readTrashedNote(id)
    await ensureInbox()
    const cur = currentInbox()
    if (!cur.notes.some((n) => n.id === note.id)) {
      const notes = [...cur.notes]
      notes.splice(Math.min(index, notes.length), 0, note)
      if (!commitInbox({ ...cur, notes })) throw new Error('Cannot change the inbox')
    }
    await p.dropTrashedNote(id)
    revision.value++
  }

  /** Shows the note in the centre pane (null closes it). */
  function openNote(noteId: string | null): void {
    openNoteId.value = noteId
    if (noteId) selectedId.value = null
  }

  // ---- outside changes to the whole project ----

  /** Re-reads project.json (after an outside change). Unsaved item edits are saved first. */
  async function reloadManifest(): Promise<boolean> {
    const s = session
    const p = project.value
    if (!s || !p) return false
    await s.autosaver.flushAll() // project.json is blocked while manifestChanged, so ours is not written
    const force = p.readOnly?.reason === 'locked-elsewhere' ? 'locked-elsewhere' : undefined
    const r = await openProject(s.io, defaultEnv, force ? { forceReadOnly: force } : {})
    if (r.status === 'refused') {
      log.error('reload.refused', { code: r.reason })
      openError.value = { kind: 'refused', reason: r.reason, error: r.error }
      return false
    }
    if (r.status === 'migration-failed') {
      log.error('migrate.failed')
      openError.value = { kind: 'migration-failed', message: r.error }
      return false
    }
    s.autosaver.dispose()
    await s.watcher.stop().catch(() => {})
    buildPieces(s)
    project.value = r.project
    issues.value = unlistedFilter(r.issues)
    externalPrompts.value = []
    manifestChanged.value = false
    epoch.value++
    itemVersions.value = {}
    sceneMeta.value = new Map()
    revision.value++
    saveStatus.value = 'saved'
    await s.watcher.start().catch((e) => console.error(e))
    await loadInbox(s, r.project)
    await loadIgnored(s, r.project)
    await loadStats(s, r.project)
    await rebuildLinks(s, r.project)
    await openContent(r.project)
    return true
  }

  /** "Keep my version" for project.json: our copy overwrites the outside change on the next save. */
  function keepManifest(): void {
    if (!manifestChanged.value) return
    manifestChanged.value = false
    mark(MANIFEST_FILE)
  }

  async function importUnlisted(
    paths: string[],
  ): Promise<{ imported: string[]; skipped: { path: string; reason: string }[] }> {
    const p = assertWritable()
    const s = session as Session
    const imported: string[] = []
    const skipped: { path: string; reason: string }[] = []
    for (const path of paths) {
      const r = await readScene(s.io, path)
      if (r === null) skipped.push({ path, reason: 'File not found' })
      else if (!r.ok) skipped.push({ path, reason: r.error.message })
      else if (
        liveIds(p.manifest).has(r.value.id) ||
        p.manifest.trash.some((t) => t.id === r.value.id)
      ) {
        skipped.push({ path, reason: 'An item with this id already exists' })
      } else {
        const node: ManuscriptNode = {
          id: r.value.id,
          type: 'scene',
          title: r.value.title,
          path,
          children: [],
        }
        const m = p.manifest.manuscript
        const chapter = findFirst(m, (n) => n.type === 'chapter')
        setManuscript(
          chapter
            ? mapNode(m, chapter.id, (n) => ({ ...n, children: [...n.children, node] }))
            : [...m, node],
        )
        await p.reloadItem(path) // from now on the file counts as known
        s.blocks.set(node.id, new Set(blockIds(r.value.content)))
        s.index.setLinks(node.id, r.value.links)
        imported.push(path)
      }
    }
    const done = new Set(imported)
    issues.value = issues.value.filter((i) => !(i.kind === 'unlisted' && done.has(i.path)))
    linkRevision.value++
    return { imported, skipped }
  }

  /** Hides the files for this session only; nothing is written. */
  function ignoreUnlisted(paths: string[]): void {
    for (const p of paths) ignoredUnlisted.add(p)
    issues.value = unlistedFilter(issues.value)
  }

  return {
    isCheckEnabled,
    setCheckEnabled,
    bookInfo,
    setBookInfo,
    goals,
    setGoals,
    dictionaries,
    setDictionaries,
    exportSettings,
    scriptExport,
    setScriptExport,
    setExportSettings,
    openedCount,
    revision,
    projectIO,
    project,
    rootPath,
    issues,
    readOnly,
    saveStatus,
    openError,
    hasBackupFor,
    restoreUnopenable,
    lockPrompt,
    lockNote,
    externalPrompts,
    manifestChanged,
    trash,
    tree,
    sceneMeta,
    wordCounts,
    sceneNumbering,
    pageStats,
    selectedId,
    openNoteId,
    inboxNotes,
    inboxInvalid,
    ignoredIds: ignoredIdSet,
    ignoredInvalid,
    stats,
    statsInvalid,
    changeStats,
    ignoreFinding,
    unignoreFinding,
    brokenLinkCount,
    resolveLinkTarget,
    linksBrokenByDeletingItem,
    linksBrokenByDeletingTimeline,
    linksBrokenByDeletingNode,
    coverageInfo,
    create,
    open,
    resolveLockPrompt,
    close,
    flush,
    updateItem,
    loadScene,
    itemVersion,
    addScene,
    addPart,
    addChapter,
    moveItem,
    setSceneMeta,
    setSceneContent,
    pruneSceneComments,
    setSceneTodos,
    addSceneComment,
    updateSceneComment,
    deleteSceneComment,
    addAsset,
    readAsset,
    rename,
    moveUpDown,
    deleteItem,
    restoreItem,
    setTimelineRefs,
    trashTimeline,
    setRuleRefs,
    trashRule,
    restoreRuleFile,
    removeUnlistedFile,
    setCodexRefs,
    setRelationRefs,
    setStateKindRefs,
    setKnowledgeRefs,
    trashEntry,
    restoreEntryFile,
    trashNode,
    dropTrashedNode,
    addNote,
    updateNote,
    moveNoteToScene,
    createSceneFromNote,
    deleteNote,
    openNote,
    resolveExternal,
    setBlockIds,
    updateSceneLinks,
    linkIndex,
    linkRevision,
    reloadManifest,
    keepManifest,
    importUnlisted,
    ignoreUnlisted,
  }
})
