import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Misspelling } from '../spell/engine'
import { misspellingRanges, textUnits, type SpellRange } from './spellRanges'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spellcheck: { recheckSpelling: () => ReturnType }
  }
}

export interface SpellcheckOptions {
  /** Resolves to [] while spellcheck is inactive. */
  check: (text: string) => Promise<Misspelling[]>
  delay: number
}

interface SpellState {
  deco: DecorationSet
  /** A word skipped because the caret was in it; shown once the caret leaves. */
  held: { from: number; to: number } | null
  /** Bumps on every refresh request; the view then drops its cached results. */
  gen: number
}

const key = new PluginKey<SpellState>('spellcheck')
const REFRESH = 'spellcheck-refresh'

/** The flagged word at a document position (caret or click), or null. */
export function misspellingAt(state: EditorState, pos: number): SpellRange | null {
  const set = key.getState(state)?.deco
  if (!set) return null
  const d = set.find(pos, pos)[0]
  return d ? { from: d.from, to: d.to, word: d.spec.word as string } : null
}

/**
 * Wavy underlines for misspelled words. Decorations only: the document is never
 * changed. Results are cached per text-block node, so only changed blocks are re-checked.
 */
export const Spellcheck = Extension.create<SpellcheckOptions>({
  name: 'spellcheck',

  addOptions() {
    return { check: async () => [], delay: 300 }
  },

  addCommands() {
    return {
      recheckSpelling:
        () =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(REFRESH, true))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const { check, delay } = this.options
    let cache = new WeakMap<PMNode, Misspelling[]>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let run = 0

    async function rebuild(view: EditorView) {
      const token = ++run
      const doc = view.state.doc
      const units = textUnits(doc)
      await Promise.all(
        units
          .filter((u) => !cache.has(u.node))
          .map(async (u) => {
            cache.set(u.node, await check(u.text).catch(() => []))
          }),
      )
      if (token !== run || view.isDestroyed) return
      const { state } = view
      // Typing moves the doc on; results for nodes that were replaced meanwhile are dropped.
      const caret = state.selection.empty && view.hasFocus() ? state.selection.head : null
      let held: SpellState['held'] = null
      const decos: Decoration[] = []
      for (const u of textUnits(state.doc)) {
        const found = cache.get(u.node)
        if (!found) continue
        for (const r of misspellingRanges(u, found)) {
          if (caret !== null && caret >= r.from && caret <= r.to) held = { from: r.from, to: r.to }
          else decos.push(Decoration.inline(r.from, r.to, { class: 'sw-misspelled' }, { word: r.word }))
        }
      }
      view.dispatch(state.tr.setMeta(key, { deco: DecorationSet.create(state.doc, decos), held }))
      // A change landed while checking: go again for the new blocks.
      if (state.doc !== doc) schedule(view)
    }

    function schedule(view: EditorView) {
      clearTimeout(timer)
      timer = setTimeout(() => void rebuild(view), delay)
    }

    return [
      new Plugin<SpellState>({
        key,
        state: {
          init: () => ({ deco: DecorationSet.empty, held: null, gen: 0 }),
          apply(tr, value) {
            const next = tr.getMeta(key) as Pick<SpellState, 'deco' | 'held'> | undefined
            if (next) return { ...next, gen: value.gen }
            if (tr.getMeta(REFRESH)) return { ...value, gen: value.gen + 1 }
            if (!tr.docChanged) return value
            return {
              ...value,
              deco: value.deco.map(tr.mapping, tr.doc),
              held: value.held && {
                from: tr.mapping.map(value.held.from),
                to: tr.mapping.map(value.held.to),
              },
            }
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.deco,
          // The browser's own spellcheck would underline a second time.
          attributes: { spellcheck: 'false' },
        },
        view(view) {
          schedule(view)
          return {
            update(v, prev) {
              if (key.getState(v.state)!.gen !== key.getState(prev)!.gen) {
                cache = new WeakMap()
                schedule(v)
              } else if (v.state.doc !== prev.doc) schedule(v)
              else {
                const held = key.getState(v.state)?.held
                const head = v.state.selection.head
                if (held && (head < held.from || head > held.to)) schedule(v)
              }
            },
            destroy() {
              clearTimeout(timer)
              run++
            },
          }
        },
      }),
    ]
  },
})
