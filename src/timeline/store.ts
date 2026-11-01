import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { datesNoLongerFitting, flagInvalidDates, gregorianCalendar, type Calendar } from '../calendar'
import type { DateProblem } from '../calendar/dates'
import { loadCalendar, saveCalendar as writeCalendar, type LoadedCalendar } from '../project/calendar'
import { newId } from '../project/ids'
import { loadTimelines, timelinePath, type TimelineStatus } from '../project/timelines'
import { parseFile } from '../project/serialize'
import { useProjectStore } from '../project/store'
import type { FileError } from '../project/types'
import { applyFilter, isEmptyFilter, type Filter } from './filter'
import { connect, disconnect, removeNode, type GraphRejection } from './graph'
import {
  addBranch as opAddBranch,
  addNode as opAddNode,
  newTimeline,
  removeBranch as opRemoveBranch,
  renameTimeline,
  setPositions,
  setView as opSetView,
  updateBranch as opUpdateBranch,
  updateNode as opUpdateNode,
  type NodePatch,
  type OpRejection,
  type OpResult,
} from './ops'
import { tidyLayout } from './layout'
import { timelineSchema, type Branch, type Timeline } from './schema'

export interface TimelineEntry {
  id: string
  path: string
  name: string
  status: TimelineStatus
  error?: FileError
}

export type Outcome =
  | { ok: true }
  | { ok: false; reason: OpRejection | 'read-only' | 'no-timeline' | 'unknown' }

const failed = (reason: Extract<Outcome, { ok: false }>['reason']) => ({ ok: false as const, reason })
const EMPTY_FILTER: Filter = { tags: [], branchIds: [] }

export const useTimelinesStore = defineStore('timelines', () => {
  const projectStore = useProjectStore()

  const entries = shallowRef<TimelineEntry[]>([])
  const docs = shallowRef(new Map<string, Timeline>())
  const calendarState = shallowRef<LoadedCalendar>({
    calendar: gregorianCalendar('gregorian'),
    source: 'fallback',
  })
  const currentId = ref<string | null>(null)
  const selectedNodeId = ref<string | null>(null)
  const selectedEdgeId = ref<string | null>(null)
  const filter = ref<Filter>({ ...EMPTY_FILTER })
  const statuses = new Map<string, { status: TimelineStatus; error?: FileError }>()
  const seen = new Map<string, number>()

  const current = computed(() => (currentId.value ? (docs.value.get(currentId.value) ?? null) : null))
  const calendar = computed<Calendar>(() => calendarState.value.calendar)
  const calendarWarning = computed(() => calendarState.value.warning ?? null)
  const usingFallbackCalendar = computed(() => calendarState.value.source === 'fallback')

  const tags = computed(() =>
    [...new Set((current.value?.nodes ?? []).flatMap((n) => (n.tag ? [n.tag] : [])))].sort(),
  )
  const filterResult = computed(() =>
    current.value ? applyFilter(current.value.nodes, current.value.edges, filter.value) : null,
  )
  const filterActive = computed(() => !isEmptyFilter(filter.value))

  /** node id -> why its date does not exist in the current calendar (current timeline). */
  const invalidDates = computed(() => {
    const map = new Map<string, DateProblem>()
    for (const f of flagInvalidDates(calendar.value, current.value?.nodes ?? [])) {
      map.set(f.id, f.reason)
    }
    return map
  })
  /** Flagged dates in every loaded timeline. */
  const invalidDateCount = computed(
    () =>
      [...docs.value.values()].reduce(
        (n, t) => n + flagInvalidDates(calendar.value, t.nodes).length,
        0,
      ),
  )

  // ---- loading ----

  function rebuildEntries(): void {
    const refs = projectStore.project?.manifest.timelines ?? []
    entries.value = refs.map((r) => {
      const st = statuses.get(r.id) ?? { status: 'ok' as const }
      return {
        id: r.id,
        path: r.path,
        name: docs.value.get(r.id)?.name ?? r.title ?? r.id,
        status: st.status,
        ...(st.error ? { error: st.error } : {}),
      }
    })
  }

  function reseedVersions(): void {
    seen.clear()
    for (const e of entries.value) seen.set(e.path, projectStore.itemVersion(e.path))
    const cal = projectStore.project?.manifest.calendar
    if (cal) seen.set(cal.path, projectStore.itemVersion(cal.path))
  }

  function ensureCurrent(): void {
    if (currentId.value && docs.value.has(currentId.value)) return
    currentId.value = entries.value.find((e) => e.status === 'ok')?.id ?? null
    selectedNodeId.value = null
    selectedEdgeId.value = null
    filter.value = { ...EMPTY_FILTER }
  }

  /** Reads everything again (after open, or after project.json was reloaded). */
  async function load(): Promise<void> {
    const p = projectStore.project
    if (!p) return reset()
    const r = await loadTimelines(p)
    docs.value = r.timelines
    statuses.clear()
    for (const [id, status] of r.status) statuses.set(id, { status, error: r.errors.get(id) })
    calendarState.value = await loadCalendar(p)
    rebuildEntries()
    ensureCurrent()
    reseedVersions()
  }

  /** Re-reads the list; only timelines not loaded yet are read from disk (after restore). */
  async function refresh(): Promise<void> {
    const p = projectStore.project
    if (!p) return reset()
    const known = new Map(docs.value)
    const r = await loadTimelines(p)
    const next = new Map<string, Timeline>()
    for (const ref of p.manifest.timelines) {
      const doc = known.get(ref.id) ?? r.timelines.get(ref.id)
      if (doc) next.set(ref.id, doc)
      if (!known.has(ref.id)) {
        statuses.set(ref.id, { status: r.status.get(ref.id) ?? 'missing', error: r.errors.get(ref.id) })
      }
    }
    docs.value = next
    rebuildEntries()
    ensureCurrent()
    reseedVersions()
  }

  function reset(): void {
    docs.value = new Map()
    entries.value = []
    statuses.clear()
    seen.clear()
    currentId.value = null
    selectedNodeId.value = null
    selectedEdgeId.value = null
    filter.value = { ...EMPTY_FILTER }
    calendarState.value = { calendar: gregorianCalendar('gregorian'), source: 'fallback' }
  }

  async function rereadOne(id: string, path: string): Promise<void> {
    const p = projectStore.project
    if (!p) return
    const text = await p.io.readText(path)
    const r = text === null ? null : parseFile(timelineSchema, text, path)
    const next = new Map(docs.value)
    if (r?.ok) {
      next.set(id, r.value)
      statuses.set(id, { status: 'ok' })
    } else {
      next.delete(id)
      statuses.set(id, r ? { status: 'invalid', error: r.error } : { status: 'missing' })
    }
    docs.value = next
    rebuildEntries()
    ensureCurrent()
    if (selectedNodeId.value && !current.value?.nodes.some((n) => n.id === selectedNodeId.value))
      selectedNodeId.value = null
    if (selectedEdgeId.value && !current.value?.edges.some((e) => e.id === selectedEdgeId.value))
      selectedEdgeId.value = null
  }

  // Files changed on disk (the project store reloads them and bumps their version).
  watch(
    () => [
      ...entries.value.map((e) => [e.path, projectStore.itemVersion(e.path), e.id] as const),
      ...(projectStore.project?.manifest.calendar
        ? [['calendar', projectStore.itemVersion(projectStore.project.manifest.calendar.path), ''] as const]
        : []),
    ],
    async (now) => {
      for (const [path, version, id] of now) {
        const key = path === 'calendar' ? projectStore.project?.manifest.calendar?.path : path
        if (!key || seen.get(key) === version) continue
        seen.set(key, version)
        if (path === 'calendar' && projectStore.project)
          calendarState.value = await loadCalendar(projectStore.project)
        else await rereadOne(id, path)
      }
    },
  )

  // ---- timelines ----

  function entryOf(id: string) {
    return entries.value.find((e) => e.id === id)
  }

  function select(id: string | null): void {
    if (id === currentId.value) return
    if (id !== null && !docs.value.has(id)) return
    currentId.value = id
    selectedNodeId.value = null
    selectedEdgeId.value = null
    filter.value = { ...EMPTY_FILTER }
  }

  function setDoc(t: Timeline): void {
    docs.value = new Map(docs.value).set(t.id, t)
    rebuildEntries()
  }

  /** Records the value for autosave and shows it. false = refused (read-only, invalid file). */
  function commit(t: Timeline): boolean {
    const e = entryOf(t.id)
    if (!e || !projectStore.updateItem(e.path, timelineSchema, t)) return false
    setDoc(t)
    return true
  }

  function edit(fn: (t: Timeline) => OpResult | Timeline): Outcome {
    const t = current.value
    if (!t) return failed('no-timeline')
    if (projectStore.readOnly) return failed('read-only')
    const r = fn(t)
    const next = 'ok' in r ? (r.ok ? r.value : null) : r
    if (!next) return failed((r as Extract<OpResult, { ok: false }>).reason)
    return commit(next) ? { ok: true } : failed('read-only')
  }

  function setRefs(next: { id: string; path: string; title?: string }[]): void {
    projectStore.setTimelineRefs(next)
    rebuildEntries()
  }

  /** New empty timeline at the end of the list; it becomes the current one. null = refused. */
  async function createTimeline(name: string): Promise<string | null> {
    const p = projectStore.project
    if (!p || p.readOnly) return null
    const t = newTimeline(newId(), name.trim() || 'Timeline')
    await p.saveItem(timelinePath(t.id), timelineSchema, t)
    statuses.set(t.id, { status: 'ok' })
    docs.value = new Map(docs.value).set(t.id, t)
    setRefs([...p.manifest.timelines, { id: t.id, path: timelinePath(t.id), title: t.name }])
    select(t.id)
    return t.id
  }

  function renameTimelineById(id: string, name: string): boolean {
    const t = docs.value.get(id)
    const p = projectStore.project
    const clean = name.trim()
    if (!t || !p || p.readOnly || clean === '' || clean === t.name) return false
    if (!commit(renameTimeline(t, clean))) return false
    setRefs(p.manifest.timelines.map((r) => (r.id === id ? { ...r, title: clean } : r)))
    return true
  }

  /** Moves the timeline to the trash. false = refused. */
  async function deleteTimeline(id: string): Promise<boolean> {
    const e = entryOf(id)
    if (!e || projectStore.readOnly) return false
    await projectStore.trashTimeline(id, e.name)
    const next = new Map(docs.value)
    next.delete(id)
    docs.value = next
    statuses.delete(id)
    if (currentId.value === id) currentId.value = null
    rebuildEntries()
    ensureCurrent()
    reseedVersions()
    return true
  }

  async function restoreTimeline(id: string): Promise<void> {
    await projectStore.restoreItem(id) // the project store calls refresh()
  }

  // ---- nodes, edges, branches ----

  function selectNode(id: string | null): void {
    selectedNodeId.value = id
    if (id) selectedEdgeId.value = null
  }
  function selectEdge(id: string | null): void {
    selectedEdgeId.value = id
    if (id) selectedNodeId.value = null
  }

  /** Adds a node right of `afterId` (default: the selected node); `connect` also links them. Selects it. */
  function addNode(o: { afterId?: string | null; connect?: boolean; title?: string } = {}) {
    const id = newId()
    const afterId = o.afterId === undefined ? selectedNodeId.value : o.afterId
    const r = edit((t) =>
      opAddNode(t, {
        id,
        title: o.title,
        afterId,
        edgeId: o.connect && afterId ? newId() : undefined,
      }),
    )
    if (r.ok) selectNode(id)
    return r.ok ? { ...r, id } : r
  }

  const updateNode = (id: string, patch: NodePatch): Outcome => edit((t) => opUpdateNode(t, id, patch))
  const moveNode = (id: string, pos: { x: number; y: number }): Outcome => updateNode(id, { pos })

  function deleteNode(id: string): Outcome {
    const r = edit((t) => removeNode(t, id))
    if (r.ok && selectedNodeId.value === id) selectedNodeId.value = null
    return r
  }

  /** Rejections (cycle, self, duplicate) come back as the reason; nothing changes then. */
  function connectNodes(from: string, to: string): Outcome & { edgeId?: string } {
    const edgeId = newId()
    const r = edit((t) => connect(t, { id: edgeId, from, to }))
    return r.ok ? { ...r, edgeId } : r
  }

  function disconnectEdge(edgeId: string): Outcome {
    const r = edit((t) => disconnect(t, edgeId))
    if (r.ok && selectedEdgeId.value === edgeId) selectedEdgeId.value = null
    return r
  }

  function addBranch(b: Omit<Branch, 'id' | 'dashed'> & { dashed?: boolean }) {
    const id = newId()
    const r = edit((t) => opAddBranch(t, { dashed: false, ...b, id }))
    return r.ok ? { ...r, id } : r
  }
  const updateBranch = (id: string, patch: Partial<Omit<Branch, 'id'>>): Outcome =>
    edit((t) => opUpdateBranch(t, id, patch))
  const deleteBranch = (id: string): Outcome => edit((t) => opRemoveBranch(t, id))

  const setView = (view: Timeline['view']): Outcome => edit((t) => opSetView(t, view))

  /** Rewrites every node position with the layered layout. */
  const tidy = (): Outcome =>
    edit((t) => setPositions(t, tidyLayout(t.nodes, t.edges)))

  // ---- filters ----

  function toggleTag(tag: string): void {
    const has = filter.value.tags.includes(tag)
    filter.value = {
      ...filter.value,
      tags: has ? filter.value.tags.filter((x) => x !== tag) : [...filter.value.tags, tag],
    }
  }
  function toggleBranch(branchId: string | null): void {
    const has = filter.value.branchIds.includes(branchId)
    filter.value = {
      ...filter.value,
      branchIds: has
        ? filter.value.branchIds.filter((x) => x !== branchId)
        : [...filter.value.branchIds, branchId],
    }
  }
  const clearFilter = () => (filter.value = { ...EMPTY_FILTER })

  // ---- calendar ----

  /** Dates in all timelines that fit now but would not fit `next` ("N dates will no longer fit"). */
  function datesNoLongerFit(next: Calendar): number {
    let n = 0
    for (const t of docs.value.values()) n += datesNoLongerFitting(calendar.value, next, t.nodes).length
    return n
  }

  /** Writes only calendar.json. Dates that no longer fit stay as they are (flagged). */
  async function saveCalendar(
    next: Calendar,
  ): Promise<{ ok: true; noLongerFit: number } | { ok: false; reason: 'read-only' | 'no-calendar' }> {
    const p = projectStore.project
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!p.manifest.calendar) return { ok: false, reason: 'no-calendar' }
    const noLongerFit = datesNoLongerFit(next)
    await writeCalendar(p, next)
    calendarState.value = { calendar: next, source: 'file' }
    seen.set(p.manifest.calendar.path, projectStore.itemVersion(p.manifest.calendar.path))
    return { ok: true, noLongerFit }
  }

  return {
    entries,
    currentId,
    current,
    selectedNodeId,
    selectedEdgeId,
    filter,
    filterActive,
    filterResult,
    tags,
    calendar,
    calendarWarning,
    usingFallbackCalendar,
    invalidDates,
    invalidDateCount,
    load,
    refresh,
    reset,
    select,
    createTimeline,
    renameTimeline: renameTimelineById,
    deleteTimeline,
    restoreTimeline,
    selectNode,
    selectEdge,
    addNode,
    updateNode,
    moveNode,
    deleteNode,
    connectNodes,
    disconnectEdge,
    addBranch,
    updateBranch,
    deleteBranch,
    setView,
    tidy,
    toggleTag,
    toggleBranch,
    clearFilter,
    datesNoLongerFit,
    saveCalendar,
  }
})

export type { GraphRejection }
