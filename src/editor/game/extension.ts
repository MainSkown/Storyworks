import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { changedRanges, fixIds } from '../blockIds'
import { isLineId } from './validate'

/** One line of a game script: optional speaker (codex entry id or plain name) and text. */
export const GameLine = Node.create({
  name: 'line',
  group: 'block',
  content: 'inline*',

  addAttributes() {
    return {
      // The stable line id (L000123); a split-off half starts without one and gets a fresh number.
      lineId: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute('data-line-id') || null,
        renderHTML: (a) => (a.lineId ? { 'data-line-id': a.lineId as string } : {}),
      },
      // speech: spoken or narrated line; text: a description with no speaker.
      kind: {
        default: 'speech',
        parseHTML: (el) => (el.getAttribute('data-kind') === 'text' ? 'text' : 'speech'),
        renderHTML: (a) => ({ 'data-kind': a.kind as string }),
      },
      speakerId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-speaker-id') || null,
        renderHTML: (a) => (a.speakerId ? { 'data-speaker-id': a.speakerId as string } : {}),
      },
      speakerName: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-speaker-name') || null,
        renderHTML: (a) => (a.speakerName ? { 'data-speaker-name': a.speakerName as string } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'p[data-line]' }, { tag: 'p' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes({ 'data-line': '', class: 'game-line' }, HTMLAttributes), 0]
  },
})

const TYPES = new Set(['line'])

/** Gives every line a unique, valid line id; ids come from `allocate` (the project counter). */
export const LineIds = Extension.create<{ allocate: () => string; ready: () => boolean }>({
  name: 'lineIds',

  addOptions() {
    return { allocate: () => '', ready: () => true }
  },

  addProseMirrorPlugins() {
    const { allocate, ready } = this.options
    return [
      new Plugin({
        key: new PluginKey('lineIds'),
        appendTransaction(transactions, _old, newState) {
          // Before the script is loaded the editor holds a placeholder doc: no ids are issued for it.
          if (!ready() || !transactions.some((tr) => tr.docChanged)) return null
          return fixIds(newState, TYPES, changedRanges(transactions), 'lineId', allocate, isLineId)
        },
        view(view) {
          if (!ready()) return {}
          const tr = fixIds(view.state, TYPES, [], 'lineId', allocate, isLineId)
          if (tr) {
            tr.setMeta('addToHistory', false).setMeta('preventUpdate', true)
            view.dispatch(tr.setMeta('skipTrailingNode', true))
          }
          return {}
        },
      }),
    ]
  },
})
