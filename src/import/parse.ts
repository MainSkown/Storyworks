import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'

/** ProseMirror JSON node as stored in scene files, before block ids are assigned. */
export interface PMNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  marks?: { type: string }[]
  text?: string
}

import type { Token } from 'markdown-it'

const md = new MarkdownIt({ html: false }).use(footnote).disable('table')

/** A line of 3+ `*`, `-` or `_` (spaces allowed between), as in `***`, `---`, `* * *`. */
export const isBreakLine = (line: string): boolean => /^\s*([*_-])(\s*\1){2,}\s*$/.test(line)

const para = (content: PMNode[] = []): PMNode => ({ type: 'paragraph', content })

function mergeText(nodes: PMNode[]): PMNode[] {
  const out: PMNode[] = []
  for (const n of nodes) {
    const prev = out[out.length - 1]
    const same = (a?: { type: string }[], b?: { type: string }[]) =>
      (a ?? []).map((m) => m.type).join() === (b ?? []).map((m) => m.type).join()
    if (n.type === 'text' && prev?.type === 'text' && same(prev.marks, n.marks))
      prev.text = (prev.text ?? '') + (n.text ?? '')
    else out.push(n)
  }
  return out.filter((n) => n.type !== 'text' || n.text)
}

/** Plain text of inline tokens (marks, links and footnote anchors dropped). */
function plainOf(children: Token[] | null): string {
  let s = ''
  for (const t of children ?? []) {
    if (t.type === 'text' || t.type === 'code_inline') s += t.content
    else if (t.type === 'softbreak' || t.type === 'hardbreak') s += ' '
  }
  return s
}

function collectFootnotes(tokens: Token[]): Map<number, string> {
  const defs = new Map<number, string>()
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t.type !== 'footnote_open') continue
    let text = ''
    for (i++; i < tokens.length && tokens[i]!.type !== 'footnote_close'; i++)
      if (tokens[i]!.type === 'inline') text += (text ? ' ' : '') + plainOf(tokens[i]!.children)
    defs.set((t.meta as { id: number }).id, text.trim())
  }
  return defs
}

function inlineNodes(children: Token[] | null, defs: Map<number, string>): PMNode[] {
  const out: PMNode[] = []
  const marks: string[] = []
  const withMarks = (n: PMNode): PMNode =>
    marks.length ? { ...n, marks: marks.map((type) => ({ type })) } : n
  for (const t of children ?? []) {
    switch (t.type) {
      case 'text':
      case 'code_inline':
        out.push(withMarks({ type: 'text', text: t.content }))
        break
      case 'softbreak':
        out.push({ type: 'text', text: ' ' })
        break
      case 'hardbreak':
        out.push({ type: 'hardBreak' })
        break
      case 'strong_open':
        marks.push('bold')
        break
      case 'em_open':
        marks.push('italic')
        break
      case 's_open':
        marks.push('strike')
        break
      case 'strong_close':
      case 'em_close':
      case 's_close':
        marks.pop()
        break
      case 'image':
        out.push({
          type: 'image',
          attrs: {
            src: safeDecode(String(t.attrGet('src') ?? '')),
            alt: plainOf(t.children) || t.content || null,
            title: (t.attrGet('title') as string | null),
          },
        })
        break
      case 'footnote_ref': {
        const body = defs.get((t.meta as { id: number }).id) ?? ''
        out.push({ type: 'footnote', content: body ? [{ type: 'text', text: body }] : [] })
        break
      }
    }
  }
  return mergeText(out)
}

function safeDecode(s: string): string {
  try {
    return decodeURI(s)
  } catch {
    return s
  }
}

/** Inline run to blocks: images (a block node in our schema) split the paragraph. */
function paragraphs(inline: PMNode[]): PMNode[] {
  const out: PMNode[] = []
  let run: PMNode[] = []
  const flush = () => {
    const blank = run.every((n) => n.type === 'text' && !n.text?.trim())
    if (run.length && !blank) out.push(para(run))
    run = []
  }
  for (const n of inline) {
    if (n.type === 'image') {
      flush()
      out.push(n)
    } else run.push(n)
  }
  flush()
  return out
}

function walk(tokens: Token[], start: number, close: string | null, defs: Map<number, string>): [PMNode[], number] {
  const out: PMNode[] = []
  let i = start
  while (i < tokens.length) {
    const t = tokens[i]!
    if (close && t.type === close) return [out, i + 1]
    switch (t.type) {
      case 'heading_open': {
        const content = inlineNodes(tokens[i + 1]!.children, defs).filter((n) => n.type !== 'image')
        out.push({ type: 'heading', attrs: { level: Math.min(Number(t.tag.slice(1)), 3) }, content })
        i += 3
        break
      }
      case 'paragraph_open':
        out.push(...paragraphs(inlineNodes(tokens[i + 1]!.children, defs)))
        i += 3
        break
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const closeType = t.type.replace('_open', '_close')
        const items: PMNode[] = []
        i++
        while (tokens[i]!.type !== closeType) {
          const [kids, next] = walk(tokens, i + 1, 'list_item_close', defs)
          if (kids[0]?.type !== 'paragraph') kids.unshift(para())
          items.push({ type: 'listItem', content: kids })
          i = next
        }
        out.push({ type: t.type === 'bullet_list_open' ? 'bulletList' : 'orderedList', content: items })
        i++
        break
      }
      case 'blockquote_open': {
        const [kids, next] = walk(tokens, i + 1, 'blockquote_close', defs)
        out.push({ type: 'blockquote', content: kids.length ? kids : [para()] })
        i = next
        break
      }
      case 'hr':
        out.push({ type: 'sceneBreak' })
        i++
        break
      case 'fence':
      case 'code_block': {
        const lines = t.content.replace(/\n$/, '').split('\n')
        const content: PMNode[] = []
        lines.forEach((l, n) => {
          if (n) content.push({ type: 'hardBreak' })
          if (l) content.push({ type: 'text', text: l })
        })
        out.push(para(content))
        i++
        break
      }
      case 'footnote_block_open':
        while (tokens[i]!.type !== 'footnote_block_close') i++
        i++
        break
      default:
        i++
    }
  }
  return [out, i]
}

/** Markdown to top-level blocks. Headings are clamped to H3; footnote definitions are folded into their references. */
export function parseMarkdown(text: string): PMNode[] {
  const tokens = md.parse(text, {})
  return walk(tokens, 0, null, collectFootnotes(tokens))[0]
}

/** Plain text: blank lines separate paragraphs, single newlines become line breaks. */
export function parsePlainText(text: string): PMNode[] {
  const out: PMNode[] = []
  for (const chunk of text.split(/\n[ \t]*(?:\n[ \t]*)+/)) {
    const lines = chunk.split('\n').map((l) => l.trim())
    while (lines.length && !lines[0]) lines.shift()
    while (lines.length && !lines[lines.length - 1]) lines.pop()
    if (!lines.length) continue
    if (lines.length === 1 && isBreakLine(lines[0]!)) {
      out.push({ type: 'sceneBreak' })
      continue
    }
    const content: PMNode[] = []
    lines.forEach((l, n) => {
      if (n) content.push({ type: 'hardBreak' })
      if (l) content.push({ type: 'text', text: l })
    })
    out.push(para(content))
  }
  return out
}
