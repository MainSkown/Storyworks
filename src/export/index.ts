import { registerExporter } from './registry'
import { docxExporter } from './docx'
import { docxScriptExporter } from './docxScript'
import { fountainExporter } from './fountain'
import { pdfExporter } from './pdf'
import { pdfScriptExporter } from './pdfScript'

/** Format exporters offered by the export page; adding a format means adding a line here. */
export function registerBuiltInExporters(): void {
  registerExporter(pdfExporter)
  registerExporter(docxExporter)
  registerExporter(pdfScriptExporter)
  registerExporter(docxScriptExporter)
  registerExporter(fountainExporter)
}
