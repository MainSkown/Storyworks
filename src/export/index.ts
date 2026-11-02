import { registerExporter } from './registry'
import { docxExporter } from './docx'
import { pdfExporter } from './pdf'

/** Format exporters offered by the export page; adding a format means adding a line here. */
export function registerBuiltInExporters(): void {
  registerExporter(pdfExporter)
  registerExporter(docxExporter)
}
