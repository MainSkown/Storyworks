import type { DictionaryInfo } from './dictionaryStore'
import { defaultDictionaryFor } from './language'
import type { DictRef } from './types'

export const refKey = (r: DictRef) => `${r.scope}:${r.name}`

/** The book's selection, or the language default (in memory only) when it has none. */
export function effectiveSelection(
  explicit: readonly DictRef[],
  language: string,
): { refs: DictRef[]; isDefault: boolean } {
  if (explicit.length > 0) return { refs: explicit.map((r) => ({ ...r })), isDefault: false }
  const def = defaultDictionaryFor(language)
  return { refs: def ? [def] : [], isDefault: true }
}

/** Selected references no installed dictionary satisfies (same lookup as the loader: local wins). */
export function findMissing(selection: readonly DictRef[], infos: readonly DictionaryInfo[]): DictRef[] {
  const out = new Map<string, DictRef>()
  for (const ref of selection) {
    const found = infos.some((i) =>
      ref.scope === 'local' ? i.source === 'local' && i.name === ref.name : i.name === ref.name,
    )
    if (!found) out.set(refKey(ref), { name: ref.name, scope: ref.scope })
  }
  return [...out.values()]
}

export function withToggled(selection: readonly DictRef[], ref: DictRef, on: boolean): DictRef[] {
  const has = selection.some((r) => refKey(r) === refKey(ref))
  if (!on) return selection.filter((r) => refKey(r) !== refKey(ref))
  return has ? [...selection] : [...selection, { name: ref.name, scope: ref.scope }]
}
