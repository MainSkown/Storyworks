import { docToText } from '../project/plainText'
import type { ItemType } from './manifestView'

const dec = new TextDecoder()

/** Readable text of an item file, for previews and diffs. */
export function itemText(type: ItemType, bytes: Uint8Array): string {
  const raw = dec.decode(bytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw
  }
  if (type === 'scene' && typeof parsed === 'object' && parsed !== null) {
    const { title, content } = parsed as { title?: unknown; content?: unknown }
    if (typeof content === 'object' && content !== null) {
      const body = docToText(content as Record<string, unknown>)
      return typeof title === 'string' && title ? `${title}\n\n${body}` : body
    }
  }
  return JSON.stringify(parsed, null, 2)
}
