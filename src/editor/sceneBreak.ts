import { mergeAttributes, Node } from '@tiptap/core'

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
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    }
  },
})
