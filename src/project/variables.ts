import {
  defaultFor,
  VARIABLES_VERSION,
  type Variable,
  type VariablesFile,
  type VariableType,
} from './schemas/variables'

export type VariableRejection = 'empty-name' | 'duplicate-name' | 'unknown-variable' | 'bad-default'
export type VariableResult =
  { ok: true; file: VariablesFile } | { ok: false; reason: VariableRejection }

export const emptyVariables = (): VariablesFile => ({ version: VARIABLES_VERSION, variables: [] })

const key = (name: string) => name.trim().toLowerCase()
const done = (file: VariablesFile, variables: Variable[]): VariableResult => ({
  ok: true,
  file: { ...file, variables },
})

/** True when another variable (not `exceptId`) already has this name, in any case. */
const taken = (file: VariablesFile, name: string, exceptId?: string) =>
  file.variables.some((v) => v.id !== exceptId && key(v.name) === key(name))

export function addVariable(
  file: VariablesFile,
  v: { id: string; name: string; type: VariableType },
): VariableResult {
  const name = v.name.trim()
  if (!name) return { ok: false, reason: 'empty-name' }
  if (taken(file, name)) return { ok: false, reason: 'duplicate-name' }
  const next = { id: v.id, name, type: v.type, default: defaultFor(v.type) } as Variable
  return done(file, [...file.variables, next])
}

function change(
  file: VariablesFile,
  id: string,
  edit: (v: Variable) => Variable | VariableRejection,
): VariableResult {
  const at = file.variables.findIndex((v) => v.id === id)
  if (at < 0) return { ok: false, reason: 'unknown-variable' }
  const out = edit(file.variables[at]!)
  if (typeof out === 'string') return { ok: false, reason: out }
  return done(
    file,
    file.variables.map((v, i) => (i === at ? out : v)),
  )
}

export const renameVariable = (file: VariablesFile, id: string, name: string): VariableResult =>
  change(file, id, (v) => {
    const n = name.trim()
    if (!n) return 'empty-name'
    return taken(file, n, id) ? 'duplicate-name' : { ...v, name: n }
  })

/** A new type starts from that type's neutral default. */
export const retypeVariable = (
  file: VariablesFile,
  id: string,
  type: VariableType,
): VariableResult =>
  change(file, id, (v) =>
    v.type === type ? v : ({ id: v.id, name: v.name, type, default: defaultFor(type) } as Variable),
  )

export const setVariableDefault = (
  file: VariablesFile,
  id: string,
  value: boolean | number | string,
): VariableResult =>
  change(file, id, (v) => {
    const fits =
      v.type === 'flag'
        ? typeof value === 'boolean'
        : v.type === 'number'
          ? typeof value === 'number' && Number.isFinite(value)
          : typeof value === 'string'
    return fits ? ({ ...v, default: value } as Variable) : 'bad-default'
  })

export function removeVariable(file: VariablesFile, id: string): VariableResult {
  if (!file.variables.some((v) => v.id === id)) return { ok: false, reason: 'unknown-variable' }
  return done(
    file,
    file.variables.filter((v) => v.id !== id),
  )
}
