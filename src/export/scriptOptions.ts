import type { ScriptPageSize } from '../editor/screenplay/layout'

/** Everything the user sets in the screenplay export form except the format and the sequence selection. */
export interface ScriptExportOptions {
  pageSize: ScriptPageSize
  titlePage: boolean
  /** Scene numbers in both margins. */
  sceneNumbers: boolean
  pageNumbers: boolean
  /** (MORE) and (CONT'D) where a speech runs over a page. */
  moreContd: boolean
}

export const defaultScriptExportOptions = (): ScriptExportOptions => ({
  pageSize: 'Letter',
  titlePage: true,
  sceneNumbers: true,
  pageNumbers: true,
  moreContd: true,
})
