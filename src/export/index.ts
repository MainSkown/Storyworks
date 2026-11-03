import { registerExporter } from './registry'
import { docxExporter } from './docx'
import { docxScriptExporter } from './docxScript'
import { fountainExporter } from './fountain'
import { gameCsvExporter, gameJsonExporter } from './gameExporters'
import { markdownExporter } from './markdown'
import { pdfExporter } from './pdf'
import { pdfScriptExporter } from './pdfScript'

/** Format exporters offered by the export page; adding a format means adding a line here. */
export function registerBuiltInExporters(): void {
  registerExporter(pdfExporter)
  registerExporter(docxExporter)
  registerExporter(markdownExporter)
  registerExporter(pdfScriptExporter)
  registerExporter(docxScriptExporter)
  registerExporter(fountainExporter)
  registerExporter(gameJsonExporter)
  registerExporter(gameCsvExporter)
}
