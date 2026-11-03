import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { Fragment, Slice, type Node as ProseNode } from '@tiptap/pm/model'
import { Plugin, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { fountainElements } from './pasteFountain'
import { cycle, emptyFallback, isElement, nextElement, type ElementType } from './rules'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    screenplay: { setElement: (type: ElementType) => ReturnType }
  }
}

const element = (name: ElementType, extra: Record<string, unknown> = {}) =>
  Node.create({
    name,
    group: 'block',
    content: 'inline*',
    ...extra,
    parseHTML() {
      return [{ tag: `p[data-element="${name}"]` }, ...((extra.rules as []) ?? [])]
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'p',
        mergeAttributes({ 'data-element': name, class: `sp-${name}` }, HTMLAttributes),
        0,
      ]
    },
  })

// Action is declared first: it is the default block (empty doc, paste).
export const ScreenplayNodes = [
  element('action', { rules: [{ tag: 'p' }, { tag: 'div' }] }),
  element('sceneHeading'),
  element('character'),
  element('dialogue'),
  element('parenthetical'),
  element('transition'),
]

/** Element type of the block holding the cursor, or null. */
export function currentElement(state: EditorState): ElementType | null {
  const name = state.selection.$from.parent.type.name
  return isElement(name) ? name : null
}

function retype(
  { state, tr, dispatch }: { state: EditorState; tr: Transaction; dispatch?: unknown },
  pick: (current: ElementType) => ElementType,
): boolean {
  const { from, to } = state.selection
  let changed = false
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!isElement(node.type.name)) return true
    const next = pick(node.type.name)
    if (next !== node.type.name && dispatch)
      tr.setNodeMarkup(pos, state.schema.nodes[next], node.attrs)
    changed = true
    return false
  })
  return changed
}

export const ScreenplayElements = Extension.create({
  name: 'screenplayElements',
  priority: 1000,

  // Tab cycles elements, so Escape then Tab is the way out of the editor (no keyboard trap).
  addStorage() {
    return { leaveOnTab: false }
  },

  addCommands() {
    return {
      setElement: (type) => (props) => retype(props, () => type),
    }
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) =>
        editor.commands.command(({ state, tr, dispatch }) => {
          const { selection } = state
          const type = currentElement(state)
          if (!selection.empty || !type) return false
          const { $from } = selection
          const parent = $from.parent
          if (parent.content.size === 0) {
            if (dispatch)
              tr.setNodeMarkup(
                $from.before(),
                state.schema.nodes[emptyFallback(type)],
                parent.attrs,
              )
            return true
          }
          // In the middle of a block the default split keeps the type.
          if ($from.parentOffset !== parent.content.size) return false
          if (dispatch) {
            const at = $from.after()
            tr.insert(at, state.schema.nodes[nextElement(type)]!.create())
            tr.setSelection(TextSelection.create(tr.doc, at + 1))
            tr.scrollIntoView()
          }
          return true
        }),
      Escape: () => {
        this.storage.leaveOnTab = true
        return false
      },
      Tab: ({ editor }) => {
        if (this.storage.leaveOnTab) {
          this.storage.leaveOnTab = false
          return false
        }
        editor.commands.command((p) => retype(p, (t) => cycle(t, 1)))
        return true
      },
      'Shift-Tab': ({ editor }) => {
        if (this.storage.leaveOnTab) {
          this.storage.leaveOnTab = false
          return false
        }
        editor.commands.command((p) => retype(p, (t) => cycle(t, -1)))
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    let fountainPaste = false
    const storage = this.storage
    return [
      new Plugin({
        props: {
          // Any other key cancels a pending Escape.
          handleKeyDown(_view, e) {
            if (!['Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key))
              storage.leaveOnTab = false
            return false
          },
        },
      }),
      new Plugin({
        // An empty scene file loads as a doc without blocks: give it one action block.
        view(view) {
          if (view.state.doc.childCount === 0) {
            const tr = view.state.tr.insert(0, view.state.schema.nodes.action!.create())
            view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true))
          }
          return {}
        },
        props: {
          // ProseMirror re-opens every slice a text parser returns; Fountain blocks must stay whole.
          transformPasted(slice) {
            if (!fountainPaste) return slice
            fountainPaste = false
            return new Slice(slice.content, 0, 0)
          },
          // Text paste: Fountain becomes typed blocks, anything else one action block per line.
          clipboardTextParser(text, _ctx, _plain, view) {
            const els = fountainElements(text)
            if (els) {
              const nodes = els.map((e) => {
                const kids: ProseNode[] = []
                e.text.split('\n').forEach((line, i) => {
                  if (i > 0) kids.push(view.state.schema.nodes.hardBreak!.create())
                  if (line) kids.push(view.state.schema.text(line))
                })
                return view.state.schema.nodes[e.type]!.create(null, kids)
              })
              fountainPaste = true
              return new Slice(Fragment.from(nodes), 0, 0)
            }
            fountainPaste = false
            const action = view.state.schema.nodes.action!
            const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
            const nodes = lines.map((l) => action.create(null, view.state.schema.text(l)))
            return new Slice(Fragment.from(nodes), 1, 1)
          },
        },
      }),
    ]
  },
})
