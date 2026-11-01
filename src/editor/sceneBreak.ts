import { mergeAttributes, Node } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sceneBreak: { setSceneBreak: () => ReturnType }
  }
}

/** Visual break inside a scene. Atom block; BlockIds gives it an id. */
export const SceneBreak = Node.create({
  name: 'sceneBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'hr' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes({ class: 'scene-break' }, HTMLAttributes)]
  },

  addCommands() {
    return {
      setSceneBreak:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name })
            // Leave the cursor in the text after the break; a selected break would be replaced by typing.
            .command(({ tr, state }) => {
              const pos = tr.selection.to
              if (!tr.doc.resolve(pos).nodeAfter)
                tr.insert(pos, state.schema.nodes.paragraph!.create())
              tr.setSelection(TextSelection.near(tr.doc.resolve(pos), 1))
              return true
            })
            .run(),
    }
  },
})
