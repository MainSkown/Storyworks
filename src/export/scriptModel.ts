import type { ScriptElement } from '../editor/screenplay/layout'
import type { ExportWarning } from './model'
import type { ScriptExportOptions } from './scriptOptions'

export interface ScriptScene {
  id: string
  title: string
  /** Plain text per element; headings carry their number when scene numbers are on. */
  elements: ScriptElement[]
}

export interface ScriptSequence {
  id: string
  /** Empty for scenes that sit directly in the project root. */
  title: string
  scenes: ScriptScene[]
}

/** Format-neutral screenplay, built once and handed to the PDF, DOCX and Fountain exporters. */
export interface ScriptDoc {
  meta: { title: string; author: string; language: string }
  titlePage: { contact: string; date: string }
  options: ScriptExportOptions
  sequences: ScriptSequence[]
  warnings: ExportWarning[]
}

export const flatElements = (doc: ScriptDoc): ScriptElement[] =>
  doc.sequences.flatMap((s) => s.scenes.flatMap((sc) => sc.elements))
