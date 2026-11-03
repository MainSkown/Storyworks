import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
import type { Node as PMNode } from '@tiptap/pm/model'
import { newId } from '../project/ids'
import { ELEMENTS } from './screenplay/rules'

/** Block node types that carry `attrs.id` (lists themselves do not, their items do). */
export const BLOCK_ID_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'horizontalRule',
  'sceneBreak',
  'image',
  ...ELEMENTS,
]

type Range = [from: number, to: number]

const isValid = (id: unknown): id is string => typeof id === 'string' && id !== ''

// Ranges of the final doc touched by the given transactions (insertions/replacements).
function changedRanges(transactions: readonly Transaction[]): Range[] {
  const maps = transactions.flatMap((tr) => tr.mapping.maps)
  const out: Range[] = []
  maps.forEach((map, i) => {
    const later = new Mapping(maps.slice(i + 1))
    map.forEach((_os, _oe, ns, ne) => out.push([later.map(ns, -1), later.map(ne, 1)]))
  })
  return out
}

/**
 * Transaction that gives every id-carrying block a unique, non-empty id, or null if none needed.
 * Blocks starting inside `ranges` count as new: untouched blocks claim their id first, so a
 * pasted or split-off copy gets the fresh id, never the original. No ranges = all blocks old.
 */
function fixIds(state: EditorState, types: Set<string>, ranges: Range[] = []): Transaction | null {
  const oldNodes: number[] = []
  const newNodes: number[] = []
  state.doc.descendants((node: PMNode, pos: number) => {
    if (!types.has(node.type.name) || node.type.spec.attrs?.id === undefined) return
    const isNew = ranges.some(([from, to]) => pos >= from && pos < to)
    ;(isNew ? newNodes : oldNodes).push(pos)
  })

  const claimed = new Set<string>()
  const fix: number[] = []
  for (const pos of [...oldNodes, ...newNodes]) {
    const id = state.doc.nodeAt(pos)!.attrs.id
    if (isValid(id) && !claimed.has(id)) claimed.add(id)
    else fix.push(pos)
  }
  if (!fix.length) return null

  const tr = state.tr
  for (const pos of fix) {
    let id = newId()
    while (claimed.has(id)) id = newId()
    claimed.add(id)
    tr.setNodeAttribute(pos, 'id', id)
  }
  return tr
}

export const BlockIds = Extension.create<{ types: string[] }>({
  name: 'blockIds',

  addOptions() {
    return { types: BLOCK_ID_TYPES }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          id: {
            default: null,
            // The split-off half starts without an id and gets a fresh one.
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute('data-id') || null,
            renderHTML: (attrs) => (attrs.id ? { 'data-id': attrs.id as string } : {}),
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    const types = new Set(this.options.types)
    return [
      new Plugin({
        key: new PluginKey('blockIds'),
        appendTransaction(transactions, _old, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          return fixIds(newState, types, changedRanges(transactions))
        },
        // Loaded content never passes through appendTransaction, so fix it once on mount.
        view(view) {
          const tr = fixIds(view.state, types)
          if (tr) {
            // skipTrailingNode: loading must not add a trailing paragraph by itself.
            tr.setMeta('addToHistory', false).setMeta('preventUpdate', true)
            view.dispatch(tr.setMeta('skipTrailingNode', true))
          }
          return {}
        },
      }),
    ]
  },
})
