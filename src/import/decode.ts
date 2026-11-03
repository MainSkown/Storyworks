export interface ImportError {
  file: string
  code: 'invalid-utf8'
}

export type DecodeResult = { ok: true; text: string } | { ok: false; error: ImportError }

/** Strict UTF-8 (BOM stripped, line endings normalized to \n); anything else is an error naming the file. */
export function decodeUtf8(file: string, bytes: Uint8Array): DecodeResult {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
    return { ok: true, text: text.replace(/\r\n?/g, '\n') }
  } catch {
    return { ok: false, error: { file, code: 'invalid-utf8' } }
  }
}
