import type { ElementType } from './rules'

/** Body rows per page (6 lines per inch, 12 pt). */
export const LINES_PER_PAGE = { Letter: 55, A4: 58 } as const
export type ScriptPageSize = keyof typeof LINES_PER_PAGE

/** Width of the text area in characters (6 in at 10 characters per inch). */
export const LINE_WIDTH = 60

interface Spec {
  /** columns from the left margin */
  indent: number
  width: number
  /** blank rows before the element (none at the top of a page) */
  blank: number
  upper: boolean
}

export const ELEMENT_LAYOUT: Record<ElementType, Spec> = {
  sceneHeading: { indent: 0, width: 60, blank: 2, upper: true },
  action: { indent: 0, width: 60, blank: 1, upper: false },
  character: { indent: 20, width: 40, blank: 1, upper: true },
  dialogue: { indent: 10, width: 35, blank: 0, upper: false },
  parenthetical: { indent: 15, width: 25, blank: 0, upper: false },
  transition: { indent: 0, width: 60, blank: 1, upper: true },
}

export interface ScriptElement {
  type: ElementType
  text: string
  /** scene number, printed beside the heading */
  number?: number
  /** caller's id for the block, passed through to the first line */
  key?: string
}

export interface PageLine {
  /** 0-based row in the page body */
  row: number
  text: string
  /** columns from the left margin */
  indent: number
  element: ElementType
  number?: number
  key?: string
}

export interface Page {
  lines: PageLine[]
}

export interface LayoutLabels {
  more: string
  contd: string
}

export interface LayoutOptions {
  pageSize: ScriptPageSize
  /** Undefined = English; null = split speeches silently, no (MORE) row and no (CONT'D). */
  labels?: LayoutLabels | null
}

export const DEFAULT_LABELS: Record<'en' | 'pl', LayoutLabels> = {
  en: { more: '(MORE)', contd: "(CONT'D)" },
  pl: { more: '(DALEJ)', contd: '(CD.)' },
}

/** Labels for a UI/project language (Polish, otherwise English). */
export const labelsFor = (language: string): LayoutLabels =>
  language.toLowerCase().startsWith('pl') ? DEFAULT_LABELS.pl : DEFAULT_LABELS.en

/** Word-wraps to `width` characters; explicit line breaks are kept, over-long words are cut. */
export function wrapLines(text: string, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word
      while (w.length > width) {
        if (line) {
          out.push(line)
          line = ''
        }
        out.push(w.slice(0, width))
        w = w.slice(width)
      }
      if (!line) line = w
      else if (line.length + 1 + w.length <= width) line += ' ' + w
      else {
        out.push(line)
        line = w
      }
    }
    if (line) out.push(line)
  }
  return out
}

interface Prepared {
  el: ScriptElement
  lines: string[]
}

interface SpeechRow {
  text: string
  element: 'dialogue' | 'parenthetical'
  indent: number
  /** last row of its element */
  itemEnd: boolean
  endsSentence: boolean
  key?: string
}

const SENTENCE_END = /[.!?…:]["'”»)\]]*$/

function prepare(elements: ScriptElement[]): Prepared[] {
  const out: Prepared[] = []
  for (const el of elements) {
    const spec = ELEMENT_LAYOUT[el.type]
    const lines = wrapLines(spec.upper ? el.text.toUpperCase() : el.text, spec.width)
    if (lines.length) out.push({ el, lines })
  }
  return out
}

function speechRows(items: Prepared[]): SpeechRow[] {
  return items.flatMap(({ el, lines }) =>
    lines.map((text, i) => ({
      text,
      element: el.type as 'dialogue' | 'parenthetical',
      indent: ELEMENT_LAYOUT[el.type].indent,
      itemEnd: i === lines.length - 1,
      endsSentence: SENTENCE_END.test(text),
      key: i === 0 ? el.key : undefined,
    })),
  )
}

/**
 * Splits the script into pages: the standard layout, one row per line. Pure and deterministic, so
 * the PDF and the page count shown in the app agree.
 * Rules: a heading is never the last thing on a page; a character cue keeps at least two speech
 * rows; a speech splits only at a sentence or element end, with (MORE) and a (CONT'D) cue; plain
 * text never leaves a single line alone at either side of a page break.
 */
export function paginate(elements: ScriptElement[], opts: LayoutOptions): Page[] {
  const perPage = LINES_PER_PAGE[opts.pageSize]
  const labels = opts.labels === undefined ? DEFAULT_LABELS.en : opts.labels
  const items = prepare(elements)
  const pages: Page[] = []
  let cur: Page | null = null
  let row = 0

  const newPage = () => {
    cur = null
    row = 0
  }
  const put = (text: string, element: ElementType, indent: number, extra: Partial<PageLine> = {}) => {
    if (!cur) {
      cur = { lines: [] }
      pages.push(cur)
    }
    cur.lines.push({ row, text, indent, element, ...extra })
    row++
  }
  const gap = (n: number) => {
    if (row > 0) row += n
  }
  const free = () => perPage - row

  function placePlain({ el, lines }: Prepared) {
    const spec = ELEMENT_LAYOUT[el.type]
    let rest = lines
    let first = true
    for (;;) {
      const b = row > 0 ? spec.blank : 0
      const avail = free() - b
      const write = (n: number) => {
        gap(spec.blank)
        for (let i = 0; i < n; i++) {
          const text = rest[i]!
          const indent = el.type === 'transition' ? Math.max(0, LINE_WIDTH - text.length) : spec.indent
          put(
            text,
            el.type,
            indent,
            first && i === 0 ? { number: el.number, key: el.key } : {},
          )
        }
        first = false
        rest = rest.slice(n)
      }
      if (rest.length <= avail) return write(rest.length)
      const k = Math.min(avail, rest.length - 2)
      if (k >= 2) {
        write(k)
        newPage()
      } else newPage()
    }
  }

  function minNext(i: number): number {
    const next = items[i + 1]
    if (!next) return 0
    const spec = ELEMENT_LAYOUT[next.el.type]
    if (next.el.type !== 'character') return spec.blank + Math.min(2, next.lines.length)
    let speech = 0
    for (let j = i + 2; j < items.length; j++) {
      const t = items[j]!.el.type
      if (t !== 'dialogue' && t !== 'parenthetical') break
      speech += items[j]!.lines.length
    }
    return spec.blank + next.lines.length + Math.min(2, speech)
  }

  const contdCue = (cue: Prepared): string[] => {
    if (!labels) return cue.lines
    const text = cue.lines.join(' ')
    return text.includes(labels.contd)
      ? cue.lines
      : wrapLines(`${text} ${labels.contd}`, ELEMENT_LAYOUT.character.width)
  }

  function placeGroup(cue: Prepared, all: SpeechRow[]) {
    const spec = ELEMENT_LAYOUT.character
    let cueLines = cue.lines
    let rows = all
    let first = true
    const writeCue = () => {
      gap(spec.blank)
      cueLines.forEach((t, i) =>
        put(t, 'character', spec.indent, first && i === 0 ? { key: cue.el.key } : {}),
      )
      first = false
    }
    const writeRows = (n: number) => {
      for (const r of rows.slice(0, n)) put(r.text, r.element, r.indent, r.key ? { key: r.key } : {})
      rows = rows.slice(n)
    }
    const canSplitAfter = (j: number) => {
      const r = rows[j - 1]!
      return j >= 2 && rows.length - j >= 2 && r.element !== 'parenthetical' && (r.itemEnd || r.endsSentence)
    }
    for (;;) {
      const b = row > 0 ? spec.blank : 0
      if (b + cueLines.length + rows.length <= free()) {
        writeCue()
        return writeRows(rows.length)
      }
      const avail = free() - b - cueLines.length - (labels ? 1 : 0) // a row for (MORE)
      let j = Math.min(avail, rows.length - 1)
      while (j >= 2 && !canSplitAfter(j)) j--
      if (j < 2) {
        if (row > 0) {
          newPage()
          continue
        }
        j = Math.max(1, Math.min(avail, rows.length - 1)) // longer than a page, no clean break
      }
      writeCue()
      writeRows(j)
      if (labels) put(labels.more, 'dialogue', spec.indent)
      newPage()
      cueLines = contdCue(cue)
    }
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!
    if (it.el.type === 'sceneHeading' && row > 0) {
      const need = ELEMENT_LAYOUT.sceneHeading.blank + it.lines.length + minNext(i)
      if (need > free()) newPage()
    }
    if (it.el.type === 'character') {
      let j = i + 1
      while (j < items.length && (items[j]!.el.type === 'dialogue' || items[j]!.el.type === 'parenthetical')) j++
      placeGroup(it, speechRows(items.slice(i + 1, j)))
      i = j - 1
    } else placePlain(it)
  }
  return pages
}
