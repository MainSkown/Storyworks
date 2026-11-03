import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { defaultEnv } from '../project/open'
import { isTauri } from '../project/pickFolder'
import { useProjectStore } from '../project/store'
import type { ProjectIO } from '../project/types'
import { useSettingsStore } from '../settings/store'
import { listBackups, makeBackup, pruneBackups, type BackupInfo } from './backups'
import { diffLines, type DiffLine } from './diff'
import { HistoryError, type HistoryEngine, type SnapshotInfo } from './engine'
import type { ChangeItem } from './items'
import { itemText } from './itemText'
import { createMemoryEngine } from './memoryEngine'
import { viewManifest, type ManifestView } from './manifestView'
import { restoreBackup, restoreItem, restoreProject, type RestoreDeps, type RestoreResult } from './restore'
import { createSnapshot, loadChanges, snapshotChanges, type SnapshotResult } from './snapshot'
import { createTauriEngine } from './tauriEngine'
import { log } from '../safety/log'

const REFRESH_DELAY_MS = 1500
const HISTORY_DIR = '.storyworks/history.git'
const dec = new TextDecoder()
const enc = new TextEncoder()

export const useHistoryStore = defineStore('history', () => {
  const project = useProjectStore()

  const items = shallowRef<ChangeItem[]>([])
  const snapshots = shallowRef<SnapshotInfo[]>([])
  const backups = shallowRef<BackupInfo[]>([])
  const error = shallowRef<HistoryError | null>(null)
  const busy = ref(false)
  /** Keys the user un-ticked; new changes start ticked. */
  const unticked = shallowRef(new Set<string>())
  const selected = computed(() => new Set(items.value.map((i) => i.key).filter((k) => !unticked.value.has(k))))
  const changeCount = computed(() => items.value.length)

  let engine: HistoryEngine | null = null
  let engineKey = ''
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function currentEngine(): { engine: HistoryEngine; io: ProjectIO } | null {
    const io = project.projectIO()
    if (!io || !project.rootPath) return null
    const key = `${project.rootPath}#${project.openedCount}`
    if (!engine || key !== engineKey) {
      engine = isTauri() ? createTauriEngine(project.rootPath) : createMemoryEngine(io, defaultEnv)
      engineKey = key
    }
    return { engine, io }
  }

  function toHistoryError(e: unknown): HistoryError {
    return e instanceof HistoryError ? e : new HistoryError('corrupt', e instanceof Error ? e.message : String(e))
  }

  function reset() {
    items.value = []
    snapshots.value = []
    backups.value = []
    error.value = null
    unticked.value = new Set()
    engine = null
    engineKey = ''
  }

  async function refresh(): Promise<void> {
    const ctx = currentEngine()
    if (!ctx) return reset()
    const mine = ++seq
    try {
      const [list, log] = [await loadChanges(ctx.engine, ctx.io), await ctx.engine.log()]
      if (mine !== seq) return
      items.value = list
      snapshots.value = log
      error.value = null
      const keys = new Set(list.map((i) => i.key))
      unticked.value = new Set([...unticked.value].filter((k) => keys.has(k)))
    } catch (e) {
      if (mine !== seq) return
      // Never show a stale list next to an unreadable history.
      items.value = []
      snapshots.value = []
      error.value = toHistoryError(e)
    }
  }

  function scheduleRefresh() {
    if (timer) clearTimeout(timer)
    timer = null
    if (!project.project) return reset()
    timer = setTimeout(() => void refresh(), REFRESH_DELAY_MS)
  }

  watch(
    () => [project.saveStatus === 'saved', project.revision, project.openedCount, project.rootPath] as const,
    ([saved]) => {
      if (saved || !project.project) scheduleRefresh()
    },
    { immediate: true },
  )

  function toggle(key: string) {
    const next = new Set(unticked.value)
    if (!next.delete(key)) next.add(key)
    unticked.value = next
  }
  const selectAll = () => void (unticked.value = new Set())
  const selectNone = () => void (unticked.value = new Set(items.value.map((i) => i.key)))

  function writable() {
    if (project.readOnly) throw new HistoryError('read-only', 'This book is open read-only.')
    const ctx = currentEngine()
    if (!ctx) throw new HistoryError('manifest', 'No book is open.')
    return ctx
  }

  async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    busy.value = true
    try {
      return await fn()
    } catch (e) {
      if (e instanceof HistoryError && e.code === 'corrupt') error.value = e
      throw e
    } finally {
      busy.value = false
    }
  }

  async function snapshotKeys(keys: string[] | 'all', message?: string): Promise<SnapshotResult> {
    const ctx = writable()
    return guarded(async () => {
      await project.flush()
      const r = await createSnapshot(ctx.engine, ctx.io, defaultEnv, { keys, message })
      await refresh()
      return r
    })
  }
  const snapshot = (message?: string) => snapshotKeys([...selected.value], message)
  const snapshotAll = (message?: string) => snapshotKeys('all', message)

  const snapshotChangesOf = (id: string) => {
    const ctx = currentEngine()
    if (!ctx) throw new HistoryError('manifest', 'No book is open.')
    return snapshotChanges(ctx.engine, id)
  }

  /** The snapshot before `id`, or null for the oldest. */
  function previousOf(id: string): string | null {
    const at = snapshots.value.findIndex((s) => s.id === id)
    return at >= 0 ? (snapshots.value[at + 1]?.id ?? null) : null
  }

  // ---- previews and diffs ----

  interface Source {
    manifest: ManifestView | null
    read(path: string): Promise<Uint8Array | null>
  }

  async function snapshotSource(id: string): Promise<Source> {
    const ctx = currentEngine()
    if (!ctx) throw new HistoryError('manifest', 'No book is open.')
    const bytes = await ctx.engine.readFile(id, 'project.json')
    return { manifest: bytes ? viewManifest(dec.decode(bytes)) : null, read: (p) => ctx.engine.readFile(id, p) }
  }

  async function workingSource(): Promise<Source> {
    const ctx = currentEngine()
    if (!ctx) throw new HistoryError('manifest', 'No book is open.')
    const text = await ctx.io.readText('project.json')
    return {
      manifest: text === null ? null : viewManifest(text),
      read: async (p) => {
        const t = await ctx.io.readText(p)
        return t === null ? null : enc.encode(t)
      },
    }
  }

  async function textFrom(src: Source, key: string): Promise<string | null> {
    if (key.startsWith('file:')) {
      const bytes = await src.read(key.slice(5))
      return bytes ? itemText('file', bytes) : null
    }
    if (key === 'settings') {
      if (!src.manifest) return null
      return JSON.stringify(JSON.parse(src.manifest.settings), null, 2)
    }
    const entry = src.manifest?.entries.find((e) => e.key === key)
    if (!entry) return null
    if (!entry.path) return entry.title
    const bytes = await src.read(entry.path)
    return bytes ? itemText(entry.type, bytes) : null
  }

  /** Readable text of an item as of a snapshot; null when it was not there. */
  const itemAsOf = async (id: string, key: string) => textFrom(await snapshotSource(id), key)
  /** Readable text of an item now; null when it is not there. */
  const itemNow = async (key: string) => textFrom(await workingSource(), key)

  /** Line diff of an item: snapshot `id` → the current text, or the previous snapshot → `id`. Null when neither side has it. */
  async function diffItem(id: string, key: string, against: 'current' | 'previous'): Promise<DiffLine[] | null> {
    let before: string | null
    let after: string | null
    if (against === 'current') {
      before = await itemAsOf(id, key)
      after = await itemNow(key)
    } else {
      const prev = previousOf(id)
      before = prev ? await itemAsOf(prev, key) : null
      after = await itemAsOf(id, key)
    }
    if (before === null && after === null) return null
    return diffLines(before ?? '', after ?? '')
  }

  // ---- restore ----

  function restoreDeps(io: ProjectIO): RestoreDeps {
    return {
      env: defaultEnv,
      readOnly: !!project.readOnly,
      makeSafetyBackup: async () => {
        const name = await makeBackup(io, defaultEnv, 'safety')
        await pruneBackups(io, { keepAuto: useSettingsStore().settings.backups.keep })
        return name
      },
    }
  }

  async function restoring(run: (ctx: { engine: HistoryEngine; io: ProjectIO }) => Promise<RestoreResult>): Promise<RestoreResult> {
    const ctx = currentEngine()
    if (!ctx) throw new HistoryError('manifest', 'No book is open.')
    if (project.readOnly) throw new HistoryError('read-only', 'This book is open read-only.')
    return guarded(async () => {
      await project.flush()
      const r = await run(ctx).catch((e) => {
        log.error('restore.failed', e)
        throw e
      })
      await project.reloadManifest()
      await Promise.all([refresh(), refreshBackups()])
      return r
    })
  }

  const restoreItemTo = (id: string, key: string) =>
    restoring((c) => restoreItem(c.engine, c.io, id, key, restoreDeps(c.io)))
  const restoreProjectTo = (id: string) => restoring((c) => restoreProject(c.engine, c.io, id, restoreDeps(c.io)))
  const restoreBackupTo = (name: string) => restoring((c) => restoreBackup(c.io, name, restoreDeps(c.io)))

  async function refreshBackups(): Promise<void> {
    const io = project.projectIO()
    backups.value = io ? await listBackups(io) : []
  }

  /** Sets a broken history aside (never deletes it) and starts an empty one. */
  async function startNewHistory(): Promise<void> {
    const ctx = writable()
    await guarded(async () => {
      if (isTauri()) {
        const stamp = new Date(defaultEnv.now()).toISOString().replace(/[:.]/g, '-')
        await ctx.io.rename(HISTORY_DIR, `${HISTORY_DIR}.broken-${stamp}`)
      } else {
        engine = createMemoryEngine(ctx.io, defaultEnv)
      }
      error.value = null
    })
    await refresh()
  }

  /** Test hook: makes the in-memory history unreadable. */
  function breakEngineForTest() {
    const e = currentEngine()?.engine as { breakIt?: () => void } | undefined
    e?.breakIt?.()
  }

  return {
    items,
    selected,
    snapshots,
    backups,
    error,
    busy,
    changeCount,
    refresh,
    refreshBackups,
    toggle,
    selectAll,
    selectNone,
    snapshot,
    snapshotAll,
    snapshotChangesOf,
    previousOf,
    itemAsOf,
    itemNow,
    diffItem,
    restoreItem: restoreItemTo,
    restoreProject: restoreProjectTo,
    restoreBackup: restoreBackupTo,
    startNewHistory,
    breakEngineForTest,
  }
})
