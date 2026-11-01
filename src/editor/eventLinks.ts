import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

/** Text blocks that take event links (list items link through their paragraph). */
const LINKABLE = new Set(['paragraph', 'heading'])

export interface BlockLinkInfo {
  count: number
  broken: boolean
}

export interface LinkedBlock extends BlockLinkInfo {
  id: string
  pos: number
}

/** Ids of the paragraphs/headings the range touches, in document order. */
export function selectedBlockIds(state: Pick<EditorState, 'doc' | 'selection'>): string[] {
  const { from, to } = state.selection
  const ids: string[] = []
  state.doc.nodesBetween(from, to, (node) => {
    const id = node.attrs.id
    if (LINKABLE.has(node.type.name) && typeof id === 'string' && id !== '') ids.push(id)
    return !node.isTextblock
  })
  return ids
}

/** Id of the paragraph or heading holding the cursor, or null. */
export function cursorBlockId(state: Pick<EditorState, 'selection'>): string | null {
  const $from = state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    const id = node.attrs.id
    if (LINKABLE.has(node.type.name) && typeof id === 'string' && id !== '') return id
  }
  return null
}

/** Blocks of `doc` that have links, with their position. */
export function linkedBlocks(
  doc: PMNode,
  info: (blockId: string) => BlockLinkInfo | null,
): LinkedBlock[] {
  const out: LinkedBlock[] = []
  doc.descendants((node, pos) => {
    if (!LINKABLE.has(node.type.name)) return true
    const id = node.attrs.id
    const i = typeof id === 'string' && id !== '' ? info(id) : null
    if (i && i.count > 0) out.push({ id: id as string, pos, ...i })
    return false
  })
  return out
}

const key = new PluginKey<DecorationSet>('eventLinks')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    eventLinks: {
      /** Rebuild the link markers after the link index changed. */
      refreshEventLinks: () => ReturnType
    }
  }
}

interface Options {
  /** Link count and broken flag of a block in the open scene, null = no links. */
  info: (blockId: string) => BlockLinkInfo | null
}

export const EventLinks = Extension.create<Options>({
  name: 'eventLinks',

  addOptions() {
    return { info: () => null }
  },

  addStorage() {
    return { selectedBlockIds: (): string[] => [] }
  },

  onCreate() {
    this.storage.selectedBlockIds = () => selectedBlockIds(this.editor.state)
  },

  addCommands() {
    return {
      refreshEventLinks:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(key, 'refresh').setMeta('addToHistory', false))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const build = (doc: PMNode): DecorationSet =>
      DecorationSet.create(
        doc,
        linkedBlocks(doc, this.options.info).map((b) =>
          Decoration.node(b.pos, b.pos + doc.nodeAt(b.pos)!.nodeSize, {
            class: b.broken ? 'has-event-link has-broken-link' : 'has-event-link',
            'data-link-count': String(b.count),
            ...(b.broken ? { 'data-link-broken': 'true' } : {}),
          }),
        ),
      )
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_c, state) => build(state.doc),
          apply: (tr, old, _o, state) =>
            tr.docChanged || tr.getMeta(key) === 'refresh' ? build(state.doc) : old,
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ]
  },
})
