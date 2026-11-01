import type { AnyExtension, Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { BlockIds } from './blockIds'
import { SceneBreak } from './sceneBreak'
import { Footnote } from './footnote'
import { CommentMark } from './commentMark'

export interface ToolbarItem {
  id: string
  /** i18n key (editor.toolbar.*) */
  labelKey: string
  icon: string
  run: (editor: Editor) => void
  isActive?: (editor: Editor) => boolean
}

export interface EditorKind {
  extensions(): AnyExtension[]
  toolbar: ToolbarItem[]
}

const align = (value: string): ToolbarItem => ({
  id: `align-${value}`,
  labelKey: `editor.toolbar.align${value[0]!.toUpperCase()}${value.slice(1)}`,
  icon: `format_align_${value}`,
  run: (e) => void e.chain().focus().setTextAlign(value).run(),
  isActive: (e) => e.isActive({ textAlign: value }),
})

const book: EditorKind = {
  extensions: () => [
    // Underline is part of StarterKit. Trailing paragraph stays (cursor target after a break/image).
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      code: false,
      link: false,
      horizontalRule: false,
    }),
    TextAlign.configure({ types: ['paragraph', 'heading', 'blockquote'] }),
    // src is a path relative to the project folder (assets/<id>.<ext>).
    Image.configure({ inline: false }),
    SceneBreak,
    Footnote,
    CommentMark,
    BlockIds,
  ],
  toolbar: [
    ...[1, 2, 3].map((level) => ({
      id: `h${level}`,
      labelKey: `editor.toolbar.heading${level}`,
      icon: `looks_${level === 1 ? 'one' : level === 2 ? 'two' : '3'}`,
      run: (e: Editor) =>
        void e
          .chain()
          .focus()
          .toggleHeading({ level: level as 1 | 2 | 3 })
          .run(),
      isActive: (e: Editor) => e.isActive('heading', { level }),
    })),
    {
      id: 'bold',
      labelKey: 'editor.toolbar.bold',
      icon: 'format_bold',
      run: (e) => void e.chain().focus().toggleBold().run(),
      isActive: (e) => e.isActive('bold'),
    },
    {
      id: 'italic',
      labelKey: 'editor.toolbar.italic',
      icon: 'format_italic',
      run: (e) => void e.chain().focus().toggleItalic().run(),
      isActive: (e) => e.isActive('italic'),
    },
    {
      id: 'underline',
      labelKey: 'editor.toolbar.underline',
      icon: 'format_underlined',
      run: (e) => void e.chain().focus().toggleUnderline().run(),
      isActive: (e) => e.isActive('underline'),
    },
    {
      id: 'bulletList',
      labelKey: 'editor.toolbar.bulletList',
      icon: 'format_list_bulleted',
      run: (e) => void e.chain().focus().toggleBulletList().run(),
      isActive: (e) => e.isActive('bulletList'),
    },
    {
      id: 'orderedList',
      labelKey: 'editor.toolbar.orderedList',
      icon: 'format_list_numbered',
      run: (e) => void e.chain().focus().toggleOrderedList().run(),
      isActive: (e) => e.isActive('orderedList'),
    },
    {
      id: 'blockquote',
      labelKey: 'editor.toolbar.quote',
      icon: 'format_quote',
      run: (e) => void e.chain().focus().toggleBlockquote().run(),
      isActive: (e) => e.isActive('blockquote'),
    },
    align('left'),
    align('center'),
    align('right'),
    align('justify'),
    {
      id: 'sceneBreak',
      labelKey: 'editor.toolbar.sceneBreak',
      icon: 'horizontal_rule',
      run: (e) => void e.chain().focus().setSceneBreak().run(),
    },
    {
      id: 'footnote',
      labelKey: 'editor.toolbar.footnote',
      icon: 'sticky_note_2',
      run: (e) => void e.chain().focus().insertFootnote().run(),
    },
  ],
}

export const editorKinds: Record<string, EditorKind> = { book }
