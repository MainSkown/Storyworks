import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { z } from 'zod'
import { createAutosaver, type Autosaver, type SaveStatus } from './autosave'
import { createChangeWatcher, type ChangeWatcher } from './changeWatcher'
import { newId } from './ids'
import { createLinkIndex, type LinkIndex } from './links'
import { createProjectLock, type ProjectLock } from './lock'
import { MANIFEST_FILE } from './migrations'
import { createProject, defaultEnv, openProject, readOnlyReasonOf } from './open'
import { createProjectIO } from './io'
import { isTauri } from './pickFolder'
import {
  MANIFEST_VERSION,
  peekManifestHeader,
  type BookMeta,
  type Manifest,
  type ManuscriptNode,
} from './schemas/manifest'
import { sceneSchema, SCENE_VERSION, type Scene } from './schemas/scene'
import { parseFile } from './serialize'
import { useSettingsStore } from '../settings/store'
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

let ioFactory: (root: string) => ProjectIO = createProjectIO
export function setProjectIOFactory(factory: (root: string) => ProjectIO): void {
  ioFactory = factory
}
export function resetProjectIOFactory(): void {
  ioFactory = createProjectIO
}

export type OpenError =
  | { kind: 'refused'; reason: 'invalid-json' | 'invalid-schema'; error: FileError }
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

function findNode(nodes: ManuscriptNode[], id: string): ManuscriptNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const inner = findNode(n.children, id)
    if (inner) return inner
  }
  return null
}

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
  for (const ref of [m.calendar, m.inbox, m.ignoredFindings, ...lists.flat()]) {
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
  /** latest unsaved value per item path */
  pending: Map<string, Pending>
  touched: Set<string>
  detach: Array<() => void>
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
  const epoch = ref(0)
  const itemVersions = ref<Record<string, number>>({})

  const readOnly = computed(() => project.value?.readOnly ?? null)
  const tree = computed<ManuscriptNode[]>(() => {
    void revision.value
    return project.value?.manifest.manuscript ?? []
  })
  const trash = computed<TrashEntry[]>(() => {
    void revision.value
    return project.value?.manifest.trash ?? []
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
    if (s.autosaver.status === 'error') saveStatus.value = 'error'
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
    findFirst(project.value?.manifest.manuscript ?? [], (n) => n.path === path)?.id ?? path

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

  async function indexScene(s: Session, id: string, path: string): Promise<void> {
    const r = await readScene(s.io, path)
    if (r?.ok) s.index.setLinks(id, r.value.links)
    else s.index.removeOwner(id)
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
    linkRevision.value++
  }

  // ---- session pieces ----

  function buildPieces(s: Session): void {
    s.pending = new Map()
    s.touched = new Set()
    let live: { rev: number; ids: Set<string> } | null = null
    s.index = createLinkIndex({
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
        await indexScene(s, nodeIdOfPath(path), path)
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
    const s = { io, lock, detach: [] } as unknown as Session
    buildPieces(s)
    session = s
    project.value = opened.project
    rootPath.value = root
    issues.value = unlistedFilter(opened.issues)
    externalPrompts.value = []
    manifestChanged.value = false
    itemVersions.value = {}
    revision.value++
    saveStatus.value = 'saved'

    if (typeof window !== 'undefined') {
      const onFocus = () => void s.watcher.recheck()
      const onUnload = () => void s.lock?.release()
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
    try {
      await s.watcher.start()
    } catch (e) {
      console.error('Could not watch the project folder', e)
    }
    await rebuildLinks(s, opened.project)
    notifyOpened(opened.project.manifest.title, root)
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
      await lock?.release()
      openError.value = { kind: 'refused', reason: r.reason, error: r.error }
      return 'failed'
    }
    if (r.status === 'migration-failed') {
      await lock?.release()
      openError.value = { kind: 'migration-failed', message: r.error }
      return 'failed'
    }
    await attach(io, root, r, lock)
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
      openError.value = { kind: 'failed', message: message(e) }
      return 'failed'
    }
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
    ignoredUnlisted.clear()
    revision.value++
    linkRevision.value++
  }

  /** Saves everything pending now. */
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
    await indexScene(s, nodeIdOfPath(path), path)
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

  async function addScene(parentId: string | null, title = 'New scene'): Promise<string> {
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
      content: { type: 'doc', content: [] },
    })
    await p.saveItem(path, sceneSchema, scene)
    const node: ManuscriptNode = { id, type: 'scene', title, path, children: [] }
    setManuscript(
      parentId === null
        ? [...manuscript, node]
        : mapNode(manuscript, parentId, (n) => ({ ...n, children: [...n.children, node] })),
    )
    return id
  }

  async function rename(id: string, title: string): Promise<void> {
    const p = assertWritable()
    const name = title.trim()
    const node = findNode(p.manifest.manuscript, id)
    if (!node || name === '' || name === node.title) return
    setManuscript(mapNode(p.manifest.manuscript, id, (n) => ({ ...n, title: name })))
    if (node.type === 'scene' && node.path && !p.isInvalid(node.path)) {
      const cur = await loadScene(node.path)
      if (cur.ok) updateItem(node.path, sceneSchema, { ...cur.value, title: name })
    }
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
      s.pending.delete(t.originalPath)
    }
    const goneIds = new Set(gone.map((t) => t.id))
    issues.value = issues.value.filter(
      (i) => !((i.kind === 'missing' || i.kind === 'invalid') && goneIds.has(i.itemId)),
    )
    revision.value++
    return entry
  }

  async function restoreItem(id: string): Promise<void> {
    const p = assertWritable()
    const s = session as Session
    await p.restoreItem(id)
    revision.value++
    const node = findNode(p.manifest.manuscript, id)
    if (node?.path) {
      if (await s.io.exists(node.path)) await indexScene(s, id, node.path)
      else setItemIssue(node.path, { status: 'missing' })
    }
    linkRevision.value++
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
      openError.value = { kind: 'refused', reason: r.reason, error: r.error }
      return false
    }
    if (r.status === 'migration-failed') {
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
    revision.value++
    saveStatus.value = 'saved'
    await s.watcher.start().catch((e) => console.error(e))
    await rebuildLinks(s, r.project)
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
    project,
    rootPath,
    issues,
    readOnly,
    saveStatus,
    openError,
    lockPrompt,
    lockNote,
    externalPrompts,
    manifestChanged,
    trash,
    tree,
    brokenLinkCount,
    create,
    open,
    resolveLockPrompt,
    close,
    flush,
    updateItem,
    loadScene,
    itemVersion,
    addScene,
    rename,
    moveUpDown,
    deleteItem,
    restoreItem,
    resolveExternal,
    reloadManifest,
    keepManifest,
    importUnlisted,
    ignoreUnlisted,
  }
})
