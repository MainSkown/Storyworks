export type PageSize = 'A4' | 'A5' | 'Letter'
export type FontFamily = 'serif' | 'sans'
export type RunningHeader = 'none' | 'book' | 'chapter'

export interface AppendixOptions {
  /** Dramatis personae: codex type ids (default: the Character type). */
  personae: { on: boolean; typeIds: string[] }
  /** Glossary: codex type ids (e.g. Item, Place). */
  glossary: { on: boolean; typeIds: string[] }
  /** Chronology of one timeline; null = none chosen. */
  chronology: { on: boolean; timelineId: string | null }
}

/** Everything the user sets in the export form except the format and the chapter selection. */
export interface ExportOptions {
  titlePage: boolean
  toc: boolean
  pageSize: PageSize
  /** Page margins in millimetres. */
  marginMm: { top: number; bottom: number; left: number; right: number }
  font: FontFamily
  /** Body font size in points. */
  fontSizePt: number
  /** Line spacing multiplier (1 = single). */
  lineSpacing: number
  pageNumbers: boolean
  runningHeader: RunningHeader
  appendices: AppendixOptions
}

export const defaultExportOptions = (): ExportOptions => ({
  titlePage: true,
  toc: true,
  pageSize: 'A4',
  marginMm: { top: 25, bottom: 25, left: 25, right: 25 },
  font: 'serif',
  fontSizePt: 11,
  lineSpacing: 1.4,
  pageNumbers: true,
  runningHeader: 'none',
  appendices: {
    personae: { on: false, typeIds: [] },
    glossary: { on: false, typeIds: [] },
    chronology: { on: false, timelineId: null },
  },
})
