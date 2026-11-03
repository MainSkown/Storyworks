import type { ExportDoc } from './model'
import type { ScriptDoc } from './scriptModel'

interface ExporterBase {
  id: string
  /** i18n key for the format name. */
  labelKey: string
  extension: string
  mime: string
  /** Project kinds this exporter works for (e.g. 'book'). */
  kinds: string[]
}

/** Book exporters take the chaptered book model. */
export interface BookExporter extends ExporterBase {
  model?: 'book'
  export(doc: ExportDoc): Promise<Uint8Array>
}

/** Screenplay exporters take the element model. */
export interface ScriptExporter extends ExporterBase {
  model: 'script'
  export(doc: ScriptDoc): Promise<Uint8Array>
}

export type Exporter = BookExporter | ScriptExporter

const exporters = new Map<string, Exporter>()

export function registerExporter(exporter: Exporter): void {
  exporters.set(exporter.id, exporter)
}

export const exportersFor = (kind: string): Exporter[] =>
  [...exporters.values()].filter((e) => e.kinds.includes(kind))

export const bookExportersFor = (kind: string): BookExporter[] =>
  exportersFor(kind).filter((e): e is BookExporter => e.model !== 'script')

export const scriptExportersFor = (kind: string): ScriptExporter[] =>
  exportersFor(kind).filter((e): e is ScriptExporter => e.model === 'script')

export const getExporter = (id: string): Exporter | undefined => exporters.get(id)

/** For tests. */
export function resetExporters(): void {
  exporters.clear()
}
