import type { ExportDoc } from './model'

export interface Exporter {
  id: string
  /** i18n key for the format name. */
  labelKey: string
  extension: string
  mime: string
  /** Project kinds this exporter works for (e.g. 'book'). */
  kinds: string[]
  export(doc: ExportDoc): Promise<Uint8Array>
}

const exporters = new Map<string, Exporter>()

export function registerExporter(exporter: Exporter): void {
  exporters.set(exporter.id, exporter)
}

export const exportersFor = (kind: string): Exporter[] =>
  [...exporters.values()].filter((e) => e.kinds.includes(kind))

export const getExporter = (id: string): Exporter | undefined => exporters.get(id)

/** For tests. */
export function resetExporters(): void {
  exporters.clear()
}
