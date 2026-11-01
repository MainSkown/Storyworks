import StarterKit from '@tiptap/starter-kit'
import { BlockIds } from './blockIds'
import { editorKinds, type EditorKind } from './kinds'

// Notes are body-only: no scene breaks, footnotes, comments, images or alignment.
const TOOLBAR = [
  'h1',
  'h2',
  'h3',
  'bold',
  'italic',
  'underline',
  'bulletList',
  'orderedList',
  'blockquote',
]

/** Reduced editor kind for inbox notes. Block ids stay, so moved text arrives with ids to renew. */
export const inboxNoteKind: EditorKind = {
  extensions: () => [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      code: false,
      link: false,
      horizontalRule: false,
    }),
    BlockIds,
  ],
  toolbar: (editorKinds.book?.toolbar ?? []).filter((i) => TOOLBAR.includes(i.id)),
}
