import { groupPickerEntries } from '../codex/pick'

export type Direction = 'out' | 'in'

/** Which entry is `fromId` and which `toId`, seen from the entry whose page is open. */
export const endpoints = (
  entryId: string,
  otherId: string,
  direction: Direction,
): { fromId: string; toId: string } =>
  direction === 'out' ? { fromId: entryId, toId: otherId } : { fromId: otherId, toId: entryId }

/** i18n key of the inline message for a store refusal. */
export const rejectionKey = (reason: string): string =>
  `relations.reject.${
    ['self', 'duplicate', 'unknown-type', 'unknown-entry', 'unknown-node', 'read-only'].includes(reason)
      ? reason
      : 'other'
  }`

export interface EntryOption {
  value: string
  label: string
  typeName: string | null
  typeColor: string | null
}

interface PickEntry {
  id: string
  name: string
  typeId: string
  aliases: readonly string[]
}
interface PickType {
  id: string
  name: string
  color: string
}

/** Live entries a user can pick (never `exclude`), matching names and aliases, in picker order. */
export function entryOptions(
  entries: readonly PickEntry[],
  types: readonly PickType[],
  query: string,
  exclude: readonly string[] = [],
): EntryOption[] {
  const skip = new Set(exclude)
  const colors = new Map(types.map((t) => [t.id, t.color]))
  const typeIdOf = new Map(entries.map((e) => [e.id, e.typeId]))
  return groupPickerEntries(
    entries.filter((e) => !skip.has(e.id)),
    types,
    query,
  ).flatMap((g) =>
    g.rows.map((r) => ({
      value: r.entryId,
      label: r.name,
      typeName: r.typeName,
      typeColor: colors.get(typeIdOf.get(r.entryId) ?? '') ?? null,
    })),
  )
}

/** Plain text of a rich-text document, shortened to `max` characters. */
export function docText(doc: unknown, max = 120): string {
  const parts: string[] = []
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    const node = n as { text?: unknown; content?: unknown; type?: unknown }
    if (typeof node.text === 'string') parts.push(node.text)
    if (Array.isArray(node.content)) {
      node.content.forEach(walk)
      if (node.type === 'paragraph' || node.type === 'heading') parts.push(' ')
    }
  }
  walk(doc)
  const text = parts.join('').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
