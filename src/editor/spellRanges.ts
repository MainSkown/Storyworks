import type { Node as PMNode } from '@tiptap/pm/model'
import type { Misspelling } from '../spell/engine'

/** A text block's inline content as one string. */
export interface TextUnit {
  node: PMNode
  /** text without block boundaries; non-text inline nodes become one space */
  text: string
  segments: { textStart: number; pos: number; len: number }[]
}

export interface SpellRange {
  from: number
  to: number
  word: string
}

/** Every text block of the document, in order. Footnote bodies are not checked (they are edited in a popover). */
export function textUnits(doc: PMNode): TextUnit[] {
  const out: TextUnit[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const segments: TextUnit['segments'] = []
    node.forEach((child, offset) => {
      if (child.isText) {
        segments.push({ textStart: text.length, pos: pos + 1 + offset, len: child.text!.length })
        text += child.text
      } else text += ' '
    })
    if (segments.length > 0) out.push({ node, text, segments })
    return false
  })
  return out
}

/** Maps checker offsets (UTF-16, as JS strings) of one unit to document ranges. */
export function misspellingRanges(unit: TextUnit, found: readonly Misspelling[]): SpellRange[] {
  const out: SpellRange[] = []
  const at = (offset: number, end: boolean) => {
    const o = end ? offset - 1 : offset
    const seg = unit.segments.find((s) => o >= s.textStart && o < s.textStart + s.len)
    return seg ? seg.pos + (o - seg.textStart) + (end ? 1 : 0) : null
  }
  for (const m of found) {
    const from = at(m.start, false)
    const to = at(m.end, true)
    if (from !== null && to !== null && to > from) out.push({ from, to, word: m.word })
  }
  return out
}
