import type { BookExporter } from './registry'
import type { ExportBlock, ExportChapter, ExportDoc, Run } from './model'

const SPECIAL = /[\\`*_[\]#<>]/g
const esc = (s: string) => s.replace(SPECIAL, '\\$&')

function runText(r: Run): string {
  if ('footnote' in r) return `[^${r.footnote}]`
  if (r.text === '\n') return '  \n'
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.text)!
  const [, pre, core, post] = m
  if (!core) return r.text
  let s = esc(core)
  if (r.italic) s = `*${s}*`
  if (r.bold) s = `**${s}**`
  return `${pre}${s}${post}`
}

/** Escapes what would turn a paragraph into a list item. */
const lineStart = (s: string) => s.replace(/^(\s*)([-+](?=\s)|\d+(?=\.\s))/, '$1\\$2')

const inline = (runs: Run[]) => runs.map(runText).join('')
const oneLine = (runs: Run[]) => inline(runs).replace(/ {2}\n/g, ' ')

function block(b: ExportBlock): string {
  switch (b.type) {
    case 'heading':
      // Chapters are ##, so a heading inside one starts at ###.
      return `${'#'.repeat(b.level + 2)} ${oneLine(b.runs)}`
    case 'paragraph':
      return lineStart(inline(b.runs))
    case 'quote':
      return b.paragraphs.map((p) => `> ${inline(p)}`).join('\n>\n')
    case 'list': {
      const counters: number[] = []
      return b.items
        .map((runs, i) => {
          const lvl = b.levels[i] ?? 0
          counters.length = lvl + 1
          counters[lvl] = (counters[lvl] ?? 0) + 1
          return `${'  '.repeat(lvl)}${b.ordered ? `${counters[lvl]}.` : '-'} ${inline(runs)}`
        })
        .join('\n')
    }
    case 'sceneBreak':
      return '* * *'
    case 'image':
      return `![](${b.path.replace(/ /g, '%20')})`
  }
}

function chapter(c: ExportChapter): string[] {
  const out = [`## ${esc(c.title)}`, ...c.blocks.map(block)]
  if (c.footnotes.length) out.push(c.footnotes.map((f) => `[^${f.n}]: ${oneLine(f.runs)}`).join('\n'))
  return out
}

export function toMarkdown(doc: ExportDoc): string {
  const parts = [`# ${esc(doc.meta.title)}`]
  if (doc.meta.author) parts.push(`*${esc(doc.meta.author)}*`)
  for (const c of doc.chapters) {
    if (c.partTitle) parts.push(`# ${esc(c.partTitle)}`)
    parts.push(...chapter(c))
  }
  for (const a of doc.appendices) parts.push(`## ${esc(a.title)}`, ...a.blocks.map(block))
  return `${parts.join('\n\n')}\n`
}

export const markdownExporter: BookExporter = {
  id: 'markdown',
  labelKey: 'export.formats.markdown',
  extension: 'md',
  mime: 'text/markdown',
  kinds: ['game'],
  async export(doc) {
    return new TextEncoder().encode(toMarkdown(doc))
  },
}
