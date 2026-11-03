import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface SpeakerLabel {
  text: string
  state: 'none' | 'name' | 'entry' | 'broken'
  /** Accessible name and tooltip. */
  title: string
}

export interface SpeakerOptions {
  /** What to show for a line's speaker attrs (resolved live from the codex). */
  label: (attrs: { speakerId: string | null; speakerName: string | null }) => SpeakerLabel
  /** Open the speaker picker for the line starting at `pos` (keyboard route). */
  onPick: (pos: number) => void
  /** A chip was clicked. */
  onChip: (pos: number) => void
}

export type SpeakerValue = { speakerId: string } | { speakerName: string } | null

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    gameSpeakers: {
      /** Sets the speaker of the line that starts at `pos` (null = narration). */
      setSpeaker: (pos: number, speaker: SpeakerValue) => ReturnType
      /** Turns every line speaking as the plain `name` into a codex speaker. */
      linkSpeakerName: (name: string, entryId: string) => ReturnType
    }
  }
}

const key = new PluginKey<DecorationSet>('speakers')
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export const Speakers = Extension.create<SpeakerOptions>({
  name: 'speakers',
  // Above the default keymap so Enter at the end of a line resets the speaker.
  priority: 1000,

  addOptions() {
    return {
      label: () => ({ text: '', state: 'none', title: '' }),
      onPick: () => {},
      onChip: () => {},
    }
  },

  addCommands() {
    return {
      setSpeaker:
        (pos, speaker) =>
        ({ tr, state, dispatch }) => {
          const node = state.doc.nodeAt(pos)
          if (node?.type.name !== 'line') return false
          if (dispatch)
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              speakerId: speaker && 'speakerId' in speaker ? speaker.speakerId : null,
              speakerName: speaker && 'speakerName' in speaker ? speaker.speakerName : null,
            })
          return true
        },
      linkSpeakerName:
        (name, entryId) =>
        ({ tr, state, dispatch }) => {
          let hit = false
          state.doc.forEach((node, pos) => {
            const n = node.attrs.speakerName as string | null
            if (node.type.name !== 'line' || !n || !same(n, name)) return
            hit = true
            if (dispatch)
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                speakerId: entryId,
                speakerName: null,
              })
          })
          return hit
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) =>
        editor.commands.command(({ state, tr, dispatch }) => {
          const { selection } = state
          const { $from } = selection
          if (!selection.empty || $from.parent.type.name !== 'line') return false
          // In the middle of a line the default split keeps the speaker on both halves.
          if ($from.parentOffset !== $from.parent.content.size) return false
          if (dispatch) {
            const at = $from.after()
            tr.insert(at, state.schema.nodes.line!.create())
            tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView()
          }
          return true
        }),
      Tab: ({ editor }) => {
        const { selection } = editor.state
        const { $from } = selection
        if (!selection.empty || $from.parent.type.name !== 'line' || $from.parentOffset !== 0)
          return false
        this.options.onPick($from.before())
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const { label, onChip } = this.options
    const build = (doc: Parameters<typeof DecorationSet.create>[0]) => {
      const decos: Decoration[] = []
      doc.forEach((node, pos) => {
        if (node.type.name !== 'line') return
        const l = label({
          speakerId: (node.attrs.speakerId as string | null) ?? null,
          speakerName: (node.attrs.speakerName as string | null) ?? null,
        })
        decos.push(
          Decoration.widget(
            pos + 1,
            (_view, getPos) => {
              const el = document.createElement('button')
              el.type = 'button'
              el.className = 'speaker-chip'
              el.contentEditable = 'false'
              el.tabIndex = -1
              el.dataset.state = l.state
              el.setAttribute('aria-label', l.title)
              el.title = l.title
              el.textContent = l.text
              el.addEventListener('click', () => {
                const at = getPos()
                if (at !== undefined) onChip(at - 1)
              })
              return el
            },
            {
              side: -1,
              key: `${l.state}|${l.text}|${l.title}`,
              stopEvent: () => true,
              ignoreSelection: true,
            },
          ),
        )
      })
      return DecorationSet.create(doc, decos)
    }
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_c, state) => build(state.doc),
          apply: (tr, set) =>
            tr.docChanged || tr.getMeta('speakers') ? build(tr.doc) : set.map(tr.mapping, tr.doc),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ]
  },
})
