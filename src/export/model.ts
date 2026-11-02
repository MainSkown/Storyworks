import type { ExportOptions } from './options'

export type Align = 'left' | 'center' | 'right' | 'justify'

export type Run =
  { text: string; bold?: boolean; italic?: boolean; underline?: boolean } | { footnote: number }

export type ExportBlock =
  | { type: 'heading'; level: 1 | 2 | 3; runs: Run[]; align: Align }
  | { type: 'paragraph'; runs: Run[]; align: Align }
  | { type: 'quote'; paragraphs: Run[][]; align: Align }
  // levels[i] is the nesting depth (0 = top) of items[i]; nested lists are flattened.
  | { type: 'list'; ordered: boolean; items: Run[][]; levels: number[] }
  | { type: 'sceneBreak' }
  // bytes null = file missing (a warning was recorded); width in pixels if the editor stored one.
  | { type: 'image'; bytes: Uint8Array | null; path: string; width?: number }

export interface ExportFootnote {
  n: number
  runs: Run[]
}

export interface ExportChapter {
  id: string
  title: string
  /** Set on the first exported chapter of each part. */
  partTitle?: string
  blocks: ExportBlock[]
  footnotes: ExportFootnote[]
}

export interface ExportAppendix {
  kind: 'personae' | 'glossary' | 'chronology'
  title: string
  blocks: ExportBlock[]
}

export interface ExportWarning {
  kind: 'missingImage' | 'unknownNode'
  detail: string
}

export interface ExportDoc {
  meta: { title: string; author: string; language: string }
  options: ExportOptions
  chapters: ExportChapter[]
  appendices: ExportAppendix[]
  warnings: ExportWarning[]
}
