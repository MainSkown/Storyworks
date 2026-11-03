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
  folderLabel: 'chapter' | 'sequence'
  /** Sections not shown until their exporter exists. */
  hiddenSections: SectionId[]
  /** Markdown/Word import is book-only until S2/S6. */
  hasImport: boolean
  /** Write shows a "coming later" empty state instead of the editor. */
  writeIsPlaceholder: boolean
}

const PROFILES: Record<KindId, KindProfile> = {
  book: {
    id: 'book',
    hasParts: true,
    folderLabel: 'chapter',
    hiddenSections: [],
    hasImport: true,
    writeIsPlaceholder: false,
  },
  screenplay: {
    id: 'screenplay',
    hasParts: false,
    folderLabel: 'sequence',
    hiddenSections: ['export'],
    hasImport: false,
    writeIsPlaceholder: false,
  },
  game: {
    id: 'game',
    hasParts: false,
    folderLabel: 'chapter',
    hiddenSections: ['export'],
    hasImport: false,
    writeIsPlaceholder: true,
  },
}

/** An unknown kind opens read-only as a book, so it gets the book profile. */
export const kindProfile = (kind: string): KindProfile =>
  isKindId(kind) ? PROFILES[kind] : PROFILES.book

/** i18n suffix for a tree node: a screenplay's chapter-level folder is a sequence. */
export const nodeKindLabel = (
  kind: string,
  type: 'part' | 'chapter' | 'scene',
): 'part' | 'chapter' | 'scene' | 'sequence' =>
  type === 'chapter' && kindProfile(kind).folderLabel === 'sequence' ? 'sequence' : type
