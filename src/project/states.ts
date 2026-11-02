import { defaultNames } from './defaultNames'
import { loadList } from './rules'
import { codexEntrySchema, type CodexEntry, type EntryState } from './schemas/codexEntry'
import { STATE_KIND_VERSION, stateKindSchema, type StateKind } from './schemas/stateKind'
import type { Env, OpenProject } from './types'

export const stateKindPath = (id: string) => `state-kinds/${id}.json`

/** Names come from defaultNames (same order). */
export const DEFAULT_STATE_KINDS: readonly Pick<StateKind, 'valueType' | 'exclusive'>[] = [
  { valueType: 'entry', exclusive: true },
  { valueType: 'entry', exclusive: true },
  { valueType: 'text', exclusive: true },
  { valueType: 'text', exclusive: false },
]

export const loadStateKinds = (project: OpenProject) =>
  loadList(project, project.manifest.stateKinds, stateKindSchema)

type KindInfo = Pick<StateKind, 'id' | 'valueType'>
type WithStates = { states: EntryState[] }

// ---- validation ----

export type StateCheck =
  { ok: true } | { ok: false; reason: 'unknown-kind' | 'empty-value' | 'unknown-entry' | 'self' }

/** Checks kind, value and (for entry-valued kinds) that the value is a live entry other than the owner. */
export function validateState(
  state: Pick<EntryState, 'kindId' | 'value'>,
  kinds: readonly KindInfo[],
  liveEntryIds: ReadonlySet<string>,
  ownerId?: string,
): StateCheck {
  const kind = kinds.find((k) => k.id === state.kindId)
  if (!kind) return { ok: false, reason: 'unknown-kind' }
  if (state.value.trim() === '') return { ok: false, reason: 'empty-value' }
  if (kind.valueType === 'entry') {
    if (state.value === ownerId) return { ok: false, reason: 'self' }
    if (!liveEntryIds.has(state.value)) return { ok: false, reason: 'unknown-entry' }
  }
  return { ok: true }
}

// ---- kinds ----

export type DeleteStateKindPlan =
  | {
      ok: true
      reassign: { entryId: string; stateId: string }[]
      targetId: string | null
      /** States that move between text and entry kinds (their value no longer fits). */
      valueTypeChanges: number
    }
  | { ok: false; reason: 'unknown-kind' | 'target-required' | 'bad-target' }

/** Which states move where when a kind is deleted. The last kind may go only if no state uses it. Pure. */
export function deleteStateKindPlan(
  kinds: readonly KindInfo[],
  entries: readonly Pick<CodexEntry, 'id' | 'states'>[],
  kindId: string,
  targetId?: string | null,
): DeleteStateKindPlan {
  const kind = kinds.find((k) => k.id === kindId)
  if (!kind) return { ok: false, reason: 'unknown-kind' }
  const reassign = entries.flatMap((e) =>
    e.states.filter((s) => s.kindId === kindId).map((s) => ({ entryId: e.id, stateId: s.id })),
  )
  if (reassign.length === 0) return { ok: true, reassign, targetId: null, valueTypeChanges: 0 }
  if (!targetId) return { ok: false, reason: 'target-required' }
  const target = kinds.find((k) => k.id === targetId)
  if (targetId === kindId || !target) return { ok: false, reason: 'bad-target' }
  return {
    ok: true,
    reassign,
    targetId,
    valueTypeChanges: target.valueType === kind.valueType ? 0 : reassign.length,
  }
}

/** Entries with `from` kind states moved to `to`; untouched entries are returned as they are. */
export function reassignStates<T extends WithStates>(
  entries: readonly T[],
  from: string,
  to: string,
): T[] {
  return entries.map((e) =>
    e.states.some((s) => s.kindId === from)
      ? { ...e, states: e.states.map((s) => (s.kindId === from ? { ...s, kindId: to } : s)) }
      : e,
  )
}

/**
 * First-open defaults: four starter kinds, only when the book has no kinds and no entry has states.
 * Idempotent; does nothing when read-only. Saves right away.
 */
export async function seedStateKinds(project: OpenProject, env: Env): Promise<void> {
  if (project.readOnly) return
  const { manifest } = project
  if (manifest.stateKinds.length > 0) return
  const entries = await loadList(project, manifest.codexEntries, codexEntrySchema)
  if ([...entries.items.values()].some((e) => e.states.length > 0)) return
  const written: string[] = []
  const before = manifest.stateKinds
  try {
    const refs = []
    const names = defaultNames(manifest.language).stateKinds
    for (const [i, { valueType, exclusive }] of DEFAULT_STATE_KINDS.entries()) {
      const kind: StateKind = {
        version: STATE_KIND_VERSION,
        id: env.newId(),
        name: names[i],
        valueType,
        exclusive,
      }
      const path = stateKindPath(kind.id)
      await project.saveItem(path, stateKindSchema, kind)
      written.push(path)
      refs.push({ id: kind.id, path, title: kind.name })
    }
    manifest.stateKinds = refs
    await project.saveManifest()
  } catch (e) {
    manifest.stateKinds = before
    await Promise.all(written.map((p) => project.io.remove(p).catch(() => {})))
    throw e
  }
}

// ---- per entry ----

export interface StateRow {
  ownerId: string
  stateId: string
  kindId: string
  from: EntryState['from']
  until: EntryState['until']
  final: boolean
}

/** Entry-valued states (any owner) whose value is `entryId`, in entry then state order. */
export function statesPointingAt(
  entries: readonly Pick<CodexEntry, 'id' | 'states'>[],
  kinds: readonly KindInfo[],
  entryId: string,
): StateRow[] {
  const entryKinds = new Set(kinds.filter((k) => k.valueType === 'entry').map((k) => k.id))
  return entries.flatMap((e) =>
    e.states
      .filter((s) => entryKinds.has(s.kindId) && s.value === entryId)
      .map((s) => ({
        ownerId: e.id,
        stateId: s.id,
        kindId: s.kindId,
        from: s.from,
        until: s.until,
        final: s.final,
      })),
  )
}

/** Entry-valued states whose value is not a live entry (trashed or missing). */
export function brokenStateValues(
  entries: readonly Pick<CodexEntry, 'id' | 'states'>[],
  kinds: readonly KindInfo[],
  liveEntryIds: ReadonlySet<string>,
): { entryId: string; stateId: string }[] {
  const entryKinds = new Set(kinds.filter((k) => k.valueType === 'entry').map((k) => k.id))
  return entries.flatMap((e) =>
    e.states
      .filter((s) => entryKinds.has(s.kindId) && !liveEntryIds.has(s.value))
      .map((s) => ({ entryId: e.id, stateId: s.id })),
  )
}

/** States whose kind does not exist (file deleted or unreadable). */
export function brokenStateKinds(
  entries: readonly Pick<CodexEntry, 'id' | 'states'>[],
  kinds: readonly KindInfo[],
): { entryId: string; stateId: string }[] {
  const ids = new Set(kinds.map((k) => k.id))
  return entries.flatMap((e) =>
    e.states.filter((s) => !ids.has(s.kindId)).map((s) => ({ entryId: e.id, stateId: s.id })),
  )
}
