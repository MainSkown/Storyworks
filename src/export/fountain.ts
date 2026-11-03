import type { ScriptElement } from '../editor/screenplay/layout'
import { FORCE_START, HEADING_RE, isCueLine, isTransitionLine } from '../import/fountain'
import type { ScriptExporter } from './registry'
import type { ScriptDoc } from './scriptModel'

const esc = (s: string) => s.replace(/[*_]/g, '\\$&')
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()
// A blank line would end the block, so it is written as two spaces.
const bodyLines = (s: string) => s.split('\n').map((l) => (l.trim() === '' ? '  ' : esc(l.trimEnd())))

/** Force `!` on the first line only: the parser reads a block by its first line. */
function actionBlock(text: string): string[] {
  const lines = bodyLines(text)
  const first = lines[0]!.trimStart()
  const force =
    FORCE_START.test(first) ||
    HEADING_RE.test(first) ||
    lines.some((l) => l.trimStart().startsWith('~')) ||
    (lines.length > 1 ? isCueLine(first) : isTransitionLine(first))
  return force ? ['!' + lines[0], ...lines.slice(1)] : lines
}

function titlePage(doc: ScriptDoc): string[] {
  const out: string[] = []
  const add = (key: string, value: string) => {
    const v = value.trim()
    if (!v) return
    if (v.includes('\n')) out.push(`${key}:`, ...v.split('\n').filter((l) => l.trim()).map((l) => `    ${l.trim()}`))
    else out.push(`${key}: ${v}`)
  }
  add('Title', doc.meta.title)
  add('Author', doc.meta.author)
  add('Contact', doc.titlePage.contact)
  add('Draft date', doc.titlePage.date)
  return out
}

/** Dialogue with no cue before it, or text that merges with a neighbour, cannot round-trip. */
export function toFountain(doc: ScriptDoc): string {
  const blocks: string[][] = []
  if (doc.options.titlePage) {
    const tp = titlePage(doc)
    if (tp.length) blocks.push(tp)
  }
  for (const seq of doc.sequences) {
    const title = oneLine(seq.title)
    if (title) blocks.push([`# ${esc(title)}`])
    const els = seq.scenes.flatMap((s) => s.elements).filter((e: ScriptElement) => e.text.trim() !== '')
    let open: string[] | null = null
    els.forEach((e, i) => {
      if (e.type === 'dialogue' || e.type === 'parenthetical') {
        const lines = e.type === 'dialogue' ? bodyLines(e.text) : [esc(parenthetical(e.text))]
        if (open) open.push(...lines)
        else blocks.push(actionBlock(lines.join('\n')))
        return
      }
      open = null
      if (e.type === 'sceneHeading') {
        const t = esc(oneLine(e.text).toUpperCase())
        blocks.push([HEADING_RE.test(t) ? t : '.' + t])
      } else if (e.type === 'character') {
        const t = esc(oneLine(e.text).toUpperCase())
        const next = els[i + 1]
        const lone = !next || (next.type !== 'dialogue' && next.type !== 'parenthetical')
        open = [lone || !isCueLine(t) || t.endsWith('^') ? '@' + t : t]
        blocks.push(open)
        if (lone) open = null
      } else if (e.type === 'transition') {
        const t = esc(oneLine(e.text).toUpperCase().replace(/\s*<+$/, ''))
        if (t) blocks.push([isTransitionLine(t) ? t : '> ' + t])
      } else blocks.push(actionBlock(e.text))
    })
  }
  return blocks.map((b) => b.join('\n')).join('\n\n') + '\n'
}

function parenthetical(text: string): string {
  const t = oneLine(text)
  return t.startsWith('(') && t.endsWith(')') ? t : `(${t})`
}

export const fountainExporter: ScriptExporter = {
  id: 'fountain',
  labelKey: 'export.formats.fountain',
  extension: 'fountain',
  mime: 'text/plain',
  kinds: ['screenplay'],
  model: 'script',
  export: async (doc) => new TextEncoder().encode(toFountain(doc)),
}
