import { Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: { insertFootnote: (text?: string) => ReturnType }
  }
}

/**
 * Inline atom holding its own inline text. The number is derived by CSS counter
 * (editor.css) and never stored; the body is edited in a popover, not in place.
 */
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  content: 'text*',
  marks: '',

  parseHTML() {
    return [{ tag: 'span[data-footnote]' }]
  },

  renderHTML() {
    return ['span', { 'data-footnote': '', class: 'footnote', contenteditable: 'false' }, 0]
  },

  addCommands() {
    return {
      insertFootnote:
        (text = '') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: text ? [{ type: 'text', text }] : [],
          }),
    }
  },
})
