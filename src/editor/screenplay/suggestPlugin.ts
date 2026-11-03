import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  suggest,
  type SuggestBlock,
  type SuggestResult,
  type SuggestSource,
  type Suggestion,
} from './suggest'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    screenplaySuggest: { acceptSuggestion: (index: number) => ReturnType }
  }
  interface Storage {
    /** Re-reads the caret position (the sheet scrolled). */
    screenplaySuggest?: { refresh: () => void }
  }
}

/** What the popup shows. `index` is the chosen option: items first, then the add-to-codex option; -1 = none. */
export interface SuggestInfo {
  items: Suggestion[]
  addName: string | null
  index: number
  /** Viewport position of the caret. */
  left: number
  top: number
  bottom: number
}

export interface SuggestOptions {
  source: () => SuggestSource
  onChange: (info: SuggestInfo | null) => void
  onAddToCodex: (name: string) => void
}

interface PluginData {
  /** null = default (first item, or none). */
  index: number | null
  /** `${blockPos}|${text}` the user closed with Esc. */
  dismissed: string | null
}

const key = new PluginKey<PluginData>('screenplaySuggest')

interface Live {
  type: SuggestBlock
  blockPos: number
  text: string
  result: SuggestResult
  index: number
  count: number
}

function live(state: EditorState, source: SuggestSource): Live | null {
  const { selection } = state
  const { $from } = selection
  const type = $from.parent.type.name
  if (!selection.empty || (type !== 'character' && type !== 'sceneHeading')) return null
  if ($from.parentOffset !== $from.parent.content.size) return null
  const text = $from.parent.textContent
  const result = suggest(type, text, source)
  if (!result.items.length && !result.addName) return null
  const data = key.getState(state)
  const blockPos = $from.before()
  if (data?.dismissed === `${blockPos}|${text}`) return null
  const count = result.items.length + (result.addName ? 1 : 0)
  const fallback = result.items.length ? 0 : -1
  const index = Math.min(data?.index ?? fallback, count - 1)
  return { type, blockPos, text, result, index, count }
}

export const ScreenplaySuggest = Extension.create<SuggestOptions>({
  name: 'screenplaySuggest',
  // Above the screenplay keymap (1000) so Enter/Tab accept while the list is open.
  priority: 1100,

  addOptions() {
    return {
      source: () => ({ lang: 'en', characters: [], places: [] }),
      onChange: () => {},
      onAddToCodex: () => {},
    }
  },

  addStorage() {
    return { refresh: () => {} }
  },

  addCommands() {
    return {
      acceptSuggestion:
        (index) =>
        ({ state, tr, dispatch }) => {
          const l = live(state, this.options.source())
          if (!l || index < 0 || index >= l.count) return false
          if (index >= l.result.items.length) {
            this.options.onAddToCodex(l.result.addName as string)
            return true
          }
          if (dispatch) {
            const start = l.blockPos + 1
            const to = start + l.text.length
            tr.insertText(l.result.items[index]!.insert, start + l.result.from, to)
            tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(to)))
            dispatch(tr)
          }
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    const move = (dir: 1 | -1) => () => {
      const view = this.editor.view
      const l = live(view.state, this.options.source())
      if (!l || !l.result.items.length) return false
      const next =
        dir === 1
          ? l.index + 1 >= l.count
            ? 0
            : l.index + 1
          : l.index <= 0
            ? l.count - 1
            : l.index - 1
      view.dispatch(view.state.tr.setMeta(key, { index: next }))
      return true
    }
    const accept = () => {
      const l = live(this.editor.state, this.options.source())
      return !!l && l.index >= 0 && this.editor.commands.acceptSuggestion(l.index)
    }
    return {
      ArrowDown: move(1),
      ArrowUp: move(-1),
      Enter: accept,
      Tab: accept,
      // Keyboard route to "Add to codex" when no list is open to arrow into.
      'Mod-Enter': () => {
        const l = live(this.editor.state, this.options.source())
        if (!l?.result.addName) return false
        this.options.onAddToCodex(l.result.addName)
        return true
      },
      Escape: () => {
        const view = this.editor.view
        const l = live(view.state, this.options.source())
        if (!l) return false
        view.dispatch(view.state.tr.setMeta(key, { dismissed: `${l.blockPos}|${l.text}` }))
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const { options, storage } = this
    let blurred = false
    const emit = (view: EditorView) => {
      const l = !blurred && view.editable ? live(view.state, options.source()) : null
      if (!l) return options.onChange(null)
      let c = { left: 0, top: 0, bottom: 0 }
      try {
        c = view.coordsAtPos(view.state.selection.head)
      } catch {
        // No layout (tests); the popup is placed at 0,0.
      }
      options.onChange({
        items: l.result.items,
        addName: l.result.addName,
        index: l.index,
        left: c.left,
        top: c.top,
        bottom: c.bottom,
      })
    }
    return [
      new Plugin<PluginData>({
        key,
        state: {
          init: () => ({ index: null, dismissed: null }),
          apply(tr, prev) {
            const meta = tr.getMeta(key) as Partial<PluginData> | undefined
            if (meta) return { ...prev, ...meta }
            return tr.docChanged || tr.selectionSet ? { ...prev, index: null } : prev
          },
        },
        view(view) {
          storage.refresh = () => emit(view)
          emit(view)
          return {
            update: () => emit(view),
            destroy: () => options.onChange(null),
          }
        },
        props: {
          handleDOMEvents: {
            blur: () => {
              blurred = true
              options.onChange(null)
              return false
            },
            focus: (view) => {
              blurred = false
              emit(view)
              return false
            },
          },
        },
      }),
    ]
  },
})
