import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (commentId: string) => ReturnType
      unsetComment: (commentId: string) => ReturnType
    }
  }
}

/** Marks the commented range; the comment body lives in the scene's `comments`. */
export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '', // overlapping comments are allowed

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) =>
          attrs.commentId ? { 'data-comment-id': attrs.commentId as string } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'comment' }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setComment:
        (commentId) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),
      unsetComment:
        (commentId) =>
        ({ tr, dispatch, state }) => {
          const type = state.schema.marks[this.name]!
          let found = false
          state.doc.descendants((node, pos) => {
            for (const mark of node.marks) {
              if (mark.type === type && mark.attrs.commentId === commentId) {
                found = true
                if (dispatch) tr.removeMark(pos, pos + node.nodeSize, mark)
              }
            }
          })
          return found
        },
    }
  },
})
