import type { ScriptElement } from './layout'
import { isElement } from './rules'

interface Node {
  type?: unknown
  text?: unknown
  attrs?: { id?: unknown }
  content?: unknown
}

function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const n of content as Node[]) {
    if (n?.type === 'text' && typeof n.text === 'string') out += n.text
    else if (n?.type === 'hardBreak') out += '\n'
  }
  return out
}

/** Script elements of a screenplay scene doc, in order; blocks that are not script elements are skipped. */
export function elementsOfDoc(doc: unknown): ScriptElement[] {
  const kids = (doc as Node | null)?.content
  if (!Array.isArray(kids)) return []
  const out: ScriptElement[] = []
  for (const k of kids as Node[]) {
    if (typeof k?.type !== 'string' || !isElement(k.type)) continue
    const el: ScriptElement = { type: k.type, text: inlineText(k.content) }
    if (typeof k.attrs?.id === 'string') el.key = k.attrs.id
    out.push(el)
  }
  return out
}
