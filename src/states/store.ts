import { computed, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { newId } from '../project/ids'
import type { ItemStatus } from '../project/rules'
import type { EntryState } from '../project/schemas/codexEntry'
import { STATE_KIND_VERSION, stateKindSchema, type StateKind } from '../project/schemas/stateKind'
import { parseFile } from '../project/serialize'
import { useProjectStore } from '../project/store'
import {
  brokenStateKinds,
  brokenStateValues,
  deleteStateKindPlan,
  loadStateKinds,
  reassignStates,
  stateKindPath,
  statesPointingAt as pointingAt,
  validateState,
  type DeleteStateKindPlan,
  type StateCheck,
  type StateRow,
} from '../project/states'
import type { FileError } from '../project/types'
import { useCodexStore } from '../codex/store'

/** One listed file, in manifest order. `status` is not 'ok' for files the UI shows as "invalid file" / "missing". */
export interface ListEntry {
  id: string
  path: string
  title: string
  status: ItemStatus
  error?: FileError
}

export type Position = EntryState['from']
/** True when `until` is definitely before `from` (the UI passes the order helper). Unknown order = false. */
export type UntilBeforeFrom = (from: Position, until: Position) => boolean

export type KindPatch = Partial<Pick<StateKind, 'name' | 'valueType' | 'exclusive'>>
export type NewState = Pick<EntryState, 'kindId' | 'value' | 'from'> &
  Partial<Pick<EntryState, 'until' | 'final'>>
export type StatePatch = Partial<Pick<EntryState, 'kindId' | 'value' | 'from' | 'until' | 'final'>>

type Rejection =
  | Extract<StateCheck, { ok: false }>['reason']
  | 'read-only'
  | 'unknown-owner'
  | 'until-before-from'
  | 'unknown-state'
export type AddStateOutcome = { ok: true; id: string } | { ok: false; reason: Rejection }
export type StateOutcome = { ok: true } | { ok: false; reason: Rejection }
export type KindOutcome =
  { ok: true } | { ok: false; reason: 'read-only' | 'unknown-kind' | 'empty-name' | 'kind-in-use' }
export type DeleteKindOutcome =
  | { ok: true; moved: number; valueTypeChanges: number }
  | {
      ok: false
      reason: 'read-only' | Extract<DeleteStateKindPlan, { ok: false }>['reason'] | 'unknown'
    }

const clean = (s: string) => s.trim()

export const useStatesStore = defineStore('states', () => {
  const projectStore = useProjectStore()
  const codex = useCodexStore()

  const kindDocs = shallowRef(new Map<string, StateKind>())
  const kindList = shallowRef<ListEntry[]>([])
  const statuses = new Map<string, { status: ItemStatus; error?: FileError }>()
  const seen = new Map<string, number>()

  const readOnly = computed(() => projectStore.readOnly)
  /** Readable kinds in manifest order. */
  const kinds = computed(() => [...kindDocs.value.values()])
  /** Ids of listed codex entries (trashed or deleted ones are not listed). */
  const liveEntryIds = computed(() => new Set(codex.entryList.map((e) => e.id)))
  /** Entry-valued states pointing at no live entry. */
  const brokenStateValueIds = computed(() =>
    brokenStateValues(codex.entries, kinds.value, liveEntryIds.value),
  )
  /** States whose kind is missing or unreadable. */
  const brokenStateKindIds = computed(() => brokenStateKinds(codex.entries, kinds.value))

  // ---- loading ----

  function rebuildList(): void {
    kindList.value = (projectStore.project?.manifest.stateKinds ?? []).map((r) => {
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
    for (const e of kindList.value) seen.set(e.path, projectStore.itemVersion(e.path))
  }

  /** Reads everything again (after open, or after project.json was reloaded). */
  async function load(): Promise<void> {
    const p = projectStore.project
    if (!p) return reset()
    const l = await loadStateKinds(p)
    kindDocs.value = l.items
    statuses.clear()
    for (const [id, status] of l.status) statuses.set(id, { status, error: l.errors.get(id) })
    rebuildList()
    reseedVersions()
  }

  function reset(): void {
    kindDocs.value = new Map()
    kindList.value = []
    statuses.clear()
    seen.clear()
  }

  async function rereadOne(id: string, path: string): Promise<void> {
    const p = projectStore.project
    if (!p) return
    const text = await p.io.readText(path)
    const r = text === null ? null : parseFile(stateKindSchema, text, path)
    const docs = new Map(kindDocs.value)
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
    const refs = projectStore.project?.manifest.stateKinds ?? []
    kindDocs.value = new Map(
      refs.flatMap((ref) => (docs.has(ref.id) ? [[ref.id, docs.get(ref.id)!] as const] : [])),
    )
    rebuildList()
  }

  // Files changed on disk (the project store reloads them and bumps their version).
  watch(
    () => kindList.value.map((e) => [e.id, e.path, projectStore.itemVersion(e.path)] as const),
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

  // ---- kinds ----

  /** New kind at the end of the list. null = refused (read-only, empty name). */
  async function createKind(
    name: string,
    o: { valueType: StateKind['valueType']; exclusive: boolean },
  ): Promise<string | null> {
    const p = projectStore.project
    const n = clean(name)
    if (!p || p.readOnly || !n) return null
    const kind: StateKind = {
      version: STATE_KIND_VERSION,
      id: newId(),
      name: n,
      valueType: o.valueType,
      exclusive: o.exclusive,
    }
    const path = stateKindPath(kind.id)
    await p.saveItem(path, stateKindSchema, kind)
    statuses.set(kind.id, { status: 'ok' })
    kindDocs.value = new Map(kindDocs.value).set(kind.id, kind)
    projectStore.setStateKindRefs({
      stateKinds: [...p.manifest.stateKinds, { id: kind.id, path, title: n }],
    })
    rebuildList()
    markSeen(path)
    return kind.id
  }

  const kindInUse = (id: string) => codex.entries.some((e) => e.states.some((s) => s.kindId === id))

  /** Changing the value type is refused ('kind-in-use') while any state uses the kind. */
  function updateKind(id: string, patch: KindPatch): KindOutcome {
    const p = projectStore.project
    const kind = kindDocs.value.get(id)
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!kind) return { ok: false, reason: 'unknown-kind' }
    const name = patch.name === undefined ? kind.name : clean(patch.name)
    if (!name) return { ok: false, reason: 'empty-name' }
    if (patch.valueType !== undefined && patch.valueType !== kind.valueType && kindInUse(id))
      return { ok: false, reason: 'kind-in-use' }
    const next: StateKind = { ...kind, ...patch, name }
    const path = kindList.value.find((e) => e.id === id)?.path
    if (!path || !projectStore.updateItem(path, stateKindSchema, next))
      return { ok: false, reason: 'read-only' }
    kindDocs.value = new Map(kindDocs.value).set(id, next)
    if (name !== kind.name)
      projectStore.setStateKindRefs({
        stateKinds: p.manifest.stateKinds.map((r) => (r.id === id ? { ...r, title: name } : r)),
      })
    rebuildList()
    return { ok: true }
  }

  /** What deleting would do (for the confirm dialog): states to move, how many change value type, or why it is refused. */
  const planDeleteKind = (id: string, targetId?: string | null): DeleteStateKindPlan =>
    deleteStateKindPlan(kinds.value, codex.entries, id, targetId)

  /** Moves the kind's states to `targetId` (required when it has any), then removes the kind file. */
  async function deleteKind(id: string, targetId?: string | null): Promise<DeleteKindOutcome> {
    const p = projectStore.project
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    const plan = planDeleteKind(id, targetId)
    if (!plan.ok) return plan
    const path = kindList.value.find((e) => e.id === id)?.path
    if (!path) return { ok: false, reason: 'unknown-kind' }
    if (plan.targetId) {
      const owners = new Set(plan.reassign.map((r) => r.entryId))
      const moved = reassignStates(
        codex.entries.filter((e) => owners.has(e.id)),
        id,
        plan.targetId,
      )
      for (const e of moved)
        if (!codex.updateEntry(e.id, { states: e.states }).ok)
          return { ok: false, reason: 'unknown' }
    }
    const next = new Map(kindDocs.value)
    next.delete(id)
    kindDocs.value = next
    statuses.delete(id)
    projectStore.setStateKindRefs({ stateKinds: p.manifest.stateKinds.filter((r) => r.id !== id) })
    rebuildList()
    try {
      await projectStore.flush() // entries and the manifest are saved before the file goes
      await projectStore.removeUnlistedFile(path)
    } catch (e) {
      console.error('Could not remove the state kind file', e)
      return { ok: false, reason: 'unknown' }
    }
    return { ok: true, moved: plan.reassign.length, valueTypeChanges: plan.valueTypeChanges }
  }

  // ---- states ----

  const statesFor = (entryId: string): EntryState[] =>
    codex.entries.find((e) => e.id === entryId)?.states ?? []
  /** Entry-valued states (on any entry) whose value is this entry. */
  const statesPointingAt = (entryId: string): StateRow[] =>
    pointingAt(codex.entries, kinds.value, entryId)

  const rejected = (reason: Rejection) => ({ ok: false as const, reason })

  function commitStates(entryId: string, states: EntryState[]): boolean {
    return codex.updateEntry(entryId, { states }).ok
  }

  /** New state at the end of the entry's list. Refuses a bad kind or value, a self reference and (via `isUntilBeforeFrom`) an until before from. */
  function addState(
    entryId: string,
    input: NewState,
    isUntilBeforeFrom?: UntilBeforeFrom,
  ): AddStateOutcome {
    if (projectStore.readOnly) return rejected('read-only')
    const owner = codex.entries.find((e) => e.id === entryId)
    if (!owner) return rejected('unknown-owner')
    const check = validateState(input, kinds.value, liveEntryIds.value, entryId)
    if (!check.ok) return check
    const until = input.until ?? null
    if (until && isUntilBeforeFrom?.(input.from, until)) return rejected('until-before-from')
    const state: EntryState = {
      id: newId(),
      kindId: input.kindId,
      value: input.value,
      from: input.from,
      until,
      final: input.final ?? false,
    }
    return commitStates(entryId, [...owner.states, state])
      ? { ok: true, id: state.id }
      : rejected('read-only')
  }

  /** Kind and value are re-checked only when they change, so a broken state stays editable. */
  function updateState(
    entryId: string,
    stateId: string,
    patch: StatePatch,
    isUntilBeforeFrom?: UntilBeforeFrom,
  ): StateOutcome {
    if (projectStore.readOnly) return rejected('read-only')
    const owner = codex.entries.find((e) => e.id === entryId)
    if (!owner) return rejected('unknown-owner')
    const state = owner.states.find((s) => s.id === stateId)
    if (!state) return rejected('unknown-state')
    const next: EntryState = { ...state, ...patch }
    if (next.kindId !== state.kindId || next.value !== state.value) {
      const check = validateState(next, kinds.value, liveEntryIds.value, entryId)
      if (!check.ok) return check
    }
    if ((patch.from !== undefined || patch.until !== undefined) && next.until) {
      if (isUntilBeforeFrom?.(next.from, next.until)) return rejected('until-before-from')
    }
    return commitStates(
      entryId,
      owner.states.map((s) => (s.id === stateId ? next : s)),
    )
      ? { ok: true }
      : rejected('read-only')
  }

  function removeState(entryId: string, stateId: string): StateOutcome {
    if (projectStore.readOnly) return rejected('read-only')
    const owner = codex.entries.find((e) => e.id === entryId)
    if (!owner) return rejected('unknown-owner')
    if (!owner.states.some((s) => s.id === stateId)) return rejected('unknown-state')
    return commitStates(
      entryId,
      owner.states.filter((s) => s.id !== stateId),
    )
      ? { ok: true }
      : rejected('read-only')
  }

  return {
    readOnly,
    kinds,
    kindList,
    brokenStateValueIds,
    brokenStateKindIds,
    load,
    reset,
    createKind,
    updateKind,
    planDeleteKind,
    deleteKind,
    statesFor,
    statesPointingAt,
    addState,
    updateState,
    removeState,
  }
})
