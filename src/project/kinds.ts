import type { SectionId } from '../sections'

export const KIND_IDS = ['book', 'screenplay', 'game'] as const
export type KindId = (typeof KIND_IDS)[number]

export const isKindId = (kind: string): kind is KindId =>
  (KIND_IDS as readonly string[]).includes(kind)

export interface KindProfile {
  id: KindId
  /** Parts above chapters (book only). */
  hasParts: boolean
  /** i18n suffix (`write.kind.<x>`) for the chapter-level node. */
  folderLabel: 'chapter' | 'sequence' | 'folder'
  /** Folders may hold folders (game only). */
  nestedFolders: boolean
  /** Sections not shown until their exporter exists. */
  hiddenSections: SectionId[]
  /** Markdown/Word import is book-only until S2/S6. */
  hasImport: boolean
}

const PROFILES: Record<KindId, KindProfile> = {
  book: {
    id: 'book',
    hasParts: true,
    folderLabel: 'chapter',
    nestedFolders: false,
    hiddenSections: ['storymap'],
    hasImport: true,
  },
  screenplay: {
    id: 'screenplay',
    hasParts: false,
    folderLabel: 'sequence',
    nestedFolders: false,
    hiddenSections: ['storymap'],
    hasImport: true,
  },
  game: {
    id: 'game',
    hasParts: false,
    folderLabel: 'folder',
    nestedFolders: true,
    hiddenSections: ['export'],
    hasImport: false,
  },
}

/** An unknown kind opens read-only as a book, so it gets the book profile. */
export const kindProfile = (kind: string): KindProfile =>
  isKindId(kind) ? PROFILES[kind] : PROFILES.book

/** i18n suffix for a tree node: a screenplay's folder is a sequence; a game's are folders and scripts. */
export const nodeKindLabel = (
  kind: string,
  type: 'part' | 'chapter' | 'scene' | 'conversation',
): 'part' | 'chapter' | 'scene' | 'sequence' | 'folder' | 'script' | 'conversation' => {
  const profile = kindProfile(kind)
  if (type === 'chapter') return profile.folderLabel
  if (type === 'scene' && profile.id === 'game') return 'script'
  return type
}
