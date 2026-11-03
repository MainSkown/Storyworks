import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { newId } from '../project/ids'
import { parseFile } from '../project/serialize'
import { useProjectStore } from '../project/store'
import type { FileError } from '../project/types'
import type { ItemStatus } from '../project/rules'
import {
  VARIABLES_FILE,
  variablesSchema,
  type Variable,
  type VariablesFile,
  type VariableType,
} from '../project/schemas/variables'
import {
  addVariable,
  emptyVariables,
  removeVariable,
  renameVariable,
  retypeVariable,
  setVariableDefault,
  type VariableRejection,
  type VariableResult,
} from '../project/variables'

export type VariableOutcome =
  { ok: true } | { ok: false; reason: VariableRejection | 'read-only' | 'unavailable' }

export const useVariablesStore = defineStore('variables', () => {
  const projectStore = useProjectStore()

  const doc = shallowRef<VariablesFile | null>(null)
  const status = ref<'none' | ItemStatus>('none')
  const error = ref<FileError | null>(null)
  let seen = -1

  const variables = computed<Variable[]>(() => doc.value?.variables ?? [])
  const readOnly = computed(() => projectStore.readOnly)

  function set(next: VariablesFile | null, st: 'none' | ItemStatus, err: FileError | null = null) {
    doc.value = next
    status.value = st
    error.value = err
  }

  async function read(): Promise<void> {
    const p = projectStore.project
    const ref = p?.manifest.variables
    if (!p || !ref) return set(null, 'none')
    const text = await p.io.readText(ref.path)
    seen = projectStore.itemVersion(ref.path)
    if (text === null) return set(null, 'missing')
    const r = parseFile(variablesSchema, text, ref.path)
    if (r.ok) set(r.value, 'ok')
    else set(null, 'invalid', r.error)
  }

  const load = read

  function reset(): void {
    set(null, 'none')
    seen = -1
  }

  // The project store reloads files changed on disk and bumps their version.
  watch(
    () => {
      const ref = projectStore.project?.manifest.variables
      return ref ? projectStore.itemVersion(ref.path) : -1
    },
    async (version) => {
      if (version !== -1 && version !== seen) await read()
    },
  )

  /** Applies an operation to the list and saves it; creates the file on the first change. */
  async function commit(op: (f: VariablesFile) => VariableResult): Promise<VariableOutcome> {
    const p = projectStore.project
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (status.value !== 'none' && status.value !== 'ok')
      return { ok: false, reason: 'unavailable' }
    const r = op(doc.value ?? emptyVariables())
    if (!r.ok) return r
    const checked = variablesSchema.safeParse(r.file)
    if (!checked.success) return { ok: false, reason: 'unavailable' }
    const ref = p.manifest.variables
    if (ref) {
      if (!projectStore.updateItem(ref.path, variablesSchema, checked.data))
        return { ok: false, reason: 'unavailable' }
    } else {
      await p.saveItem(VARIABLES_FILE, variablesSchema, checked.data)
      projectStore.setVariablesRef({ id: newId(), path: VARIABLES_FILE })
      seen = projectStore.itemVersion(VARIABLES_FILE)
    }
    set(checked.data, 'ok')
    return { ok: true }
  }

  // Sync edits (no file to create) go through the same path; the first add is async.
  function commitSync(op: (f: VariablesFile) => VariableResult): VariableOutcome {
    const p = projectStore.project
    const ref = p?.manifest.variables
    if (!p || p.readOnly) return { ok: false, reason: 'read-only' }
    if (!ref || status.value !== 'ok' || !doc.value) return { ok: false, reason: 'unavailable' }
    const r = op(doc.value)
    if (!r.ok) return r
    const checked = variablesSchema.safeParse(r.file)
    if (!checked.success || !projectStore.updateItem(ref.path, variablesSchema, checked.data))
      return { ok: false, reason: 'unavailable' }
    set(checked.data, 'ok')
    return { ok: true }
  }

  const add = (name: string, type: VariableType) =>
    commit((f) => addVariable(f, { id: newId(), name, type }))
  const rename = (id: string, name: string) => commitSync((f) => renameVariable(f, id, name))
  const retype = (id: string, type: VariableType) => commitSync((f) => retypeVariable(f, id, type))
  const setDefault = (id: string, value: boolean | number | string) =>
    commitSync((f) => setVariableDefault(f, id, value))
  const remove = (id: string) => commitSync((f) => removeVariable(f, id))

  return {
    variables,
    status,
    error,
    readOnly,
    load,
    reset,
    add,
    rename,
    retype,
    setDefault,
    remove,
  }
})
