import type { AnyExtension, Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { BlockIds } from './blockIds'
import { SceneBreak } from './sceneBreak'
import { Footnote } from './footnote'
import { CommentMark } from './commentMark'
import { ProjectImage, type ProjectImageOptions } from './projectImage'
import { Spellcheck, type SpellcheckOptions } from './spellcheck'
import { Document } from '@tiptap/extension-document'
import { Text } from '@tiptap/extension-text'
import { UndoRedo } from '@tiptap/extensions'
import { ScreenplayNodes, ScreenplayElements } from './screenplay/extension'
import { SceneNumberMargin } from './screenplay/sceneNumberMargin'
import { ScreenplaySuggest, type SuggestOptions } from './screenplay/suggestPlugin'
import { EventLinks, selectedBlockIds, type BlockLinkInfo } from './eventLinks'

export interface ToolbarItem {
  id: string
  /** i18n key (editor.toolbar.*) */
  labelKey: string
  icon: string
  run: (editor: Editor) => void
  /** Needs UI of its own (popover, picker, prompt): the toolbar emits this instead of calling run. */
  action?: 'footnote' | 'image' | 'comment' | 'eventLink' | 'element'
  canRun?: (editor: Editor) => boolean
  isActive?: (editor: Editor) => boolean
  /** Accent button: shows its label next to the icon. */
  accent?: boolean
}

export interface EditorContext extends Partial<ProjectImageOptions> {
  /** Link count and broken flag of a block of the open scene. */
  eventLinkInfo?: (blockId: string) => BlockLinkInfo | null
  /** Misspelling checker; absent = no spellcheck. */
  spellcheck?: SpellcheckOptions['check']
  /** Screenplay: heading block id -> scene number. */
  sceneNumbers?: () => ReadonlyMap<string, number>
  /** Screenplay: cue and heading autocomplete; absent = none. */
  suggest?: SuggestOptions
}

export interface EditorKind {
  extensions(ctx?: EditorContext): AnyExtension[]
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
  extensions: ({ eventLinkInfo, spellcheck, ...ctx } = {}) => [
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
    ProjectImage.configure({ inline: false, ...ctx }),
    SceneBreak,
    Footnote,
    CommentMark,
    BlockIds,
    EventLinks.configure({ info: eventLinkInfo ?? (() => null) }),
    ...(spellcheck ? [Spellcheck.configure({ check: spellcheck })] : []),
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
      action: 'footnote',
    },
    {
      id: 'image',
      labelKey: 'editor.toolbar.image',
      icon: 'image',
      run: () => undefined,
      action: 'image',
    },
    {
      id: 'comment',
      labelKey: 'editor.toolbar.comment',
      icon: 'add_comment',
      run: () => undefined,
      action: 'comment',
      canRun: (e) => !e.state.selection.empty,
    },
    {
      id: 'eventLink',
      labelKey: 'editor.toolbar.eventLink',
      icon: 'event',
      run: () => undefined,
      action: 'eventLink',
      accent: true,
      canRun: (e) => selectedBlockIds(e.state).length > 0,
    },
  ],
}

const screenplay: EditorKind = {
  extensions: ({ eventLinkInfo, spellcheck, sceneNumbers, suggest } = {}) => [
    Document,
    Text,
    ...ScreenplayNodes,
    ScreenplayElements,
    UndoRedo,
    CommentMark,
    BlockIds,
    EventLinks.configure({ info: eventLinkInfo ?? (() => null) }),
    ...(spellcheck ? [Spellcheck.configure({ check: spellcheck })] : []),
    ...(sceneNumbers ? [SceneNumberMargin.configure({ numbers: sceneNumbers })] : []),
    ...(suggest ? [ScreenplaySuggest.configure(suggest)] : []),
  ],
  toolbar: [
    // The element dropdown is drawn by the toolbar component.
    {
      id: 'element',
      labelKey: 'editor.toolbar.element',
      icon: 'subject',
      run: () => undefined,
      action: 'element',
    },
    {
      id: 'undo',
      labelKey: 'editor.toolbar.undo',
      icon: 'undo',
      run: (e) => void e.chain().focus().undo().run(),
      canRun: (e) => e.can().undo(),
    },
    {
      id: 'redo',
      labelKey: 'editor.toolbar.redo',
      icon: 'redo',
      run: (e) => void e.chain().focus().redo().run(),
      canRun: (e) => e.can().redo(),
    },
    {
      id: 'comment',
      labelKey: 'editor.toolbar.comment',
      icon: 'add_comment',
      run: () => undefined,
      action: 'comment',
      canRun: (e) => !e.state.selection.empty,
    },
    {
      id: 'eventLink',
      labelKey: 'editor.toolbar.eventLink',
      icon: 'event',
      run: () => undefined,
      action: 'eventLink',
      accent: true,
      canRun: (e) => selectedBlockIds(e.state).length > 0,
    },
  ],
}

export const editorKinds: Record<string, EditorKind> = { book, screenplay }
