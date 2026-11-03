import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface SceneNumberOptions {
  /** Heading block id -> scene number; read on every view update. */
  numbers: () => ReadonlyMap<string, number>
}

/** Marks scene headings with `data-scene-number`; CSS draws the number in the margin. */
export const SceneNumberMargin = Extension.create<SceneNumberOptions>({
  name: 'sceneNumberMargin',

  addOptions() {
    return { numbers: () => new Map() }
  },

  addProseMirrorPlugins() {
    const { numbers } = this.options
    return [
      new Plugin({
        props: {
          decorations(state) {
            const map = numbers()
            if (!map.size) return null
            const decos: Decoration[] = []
            state.doc.forEach((node, offset) => {
              if (node.type.name !== 'sceneHeading') return
              const n = map.get(node.attrs.id as string)
              if (n !== undefined)
                decos.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    'data-scene-number': String(n),
                  }),
                )
            })
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
