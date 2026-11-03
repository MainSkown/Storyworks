import type { ElementType } from '../editor/screenplay/rules'

export interface FountainElement {
  type: ElementType
  text: string
}
export type SkippedConstruct =
  | 'titlePage'
  | 'boneyard'
  | 'note'
  | 'synopsis'
  | 'centered'
  | 'pageBreak'
  | 'sceneNumber'
  | 'dualDialogue'
  | 'emphasis'
  | 'lyrics'
export interface FountainResult {
  sequences: { title: string; scenes: { title: string; elements: FountainElement[] }[] }[]
  titlePage: Record<string, string>
  skipped: { construct: SkippedConstruct; count: number }[]
  /** No scene heading found: everything sits in one action-only scene. */
  noSceneHeadings: boolean
}

const ORDER: SkippedConstruct[] = [
  'titlePage', 'boneyard', 'note', 'synopsis', 'centered', 'pageBreak', 'sceneNumber', 'dualDialogue', 'emphasis', 'lyrics',
]

export const HEADING_RE = /^(?:int|ext|est|int\.?\/ext\.?|i\/e)[. ]/i
/** First characters that make a line a forced or special element. */
export const FORCE_START = /^(?:[.@!~=#>]|\[\[|\/\*)/

const isCasedUpper = (s: string) => s === s.toUpperCase() && s !== s.toLowerCase()

/** A line that is a character cue by itself (all caps, optional extension and `^`). */
export function isCueLine(line: string): boolean {
  const s = line.trim()
  if (!s || FORCE_START.test(s) || HEADING_RE.test(s)) return false
  return isCasedUpper(s.replace(/\s*\^$/, '').replace(/(\s*\([^)]*\))+$/, ''))
}

/** An all-caps line ending in TO: that is a transition by itself. */
export function isTransitionLine(line: string): boolean {
  const s = line.trim()
  return !!s && !FORCE_START.test(s) && !HEADING_RE.test(s) && /TO:$/.test(s) && s === s.toUpperCase()
}

const KEY_RE = /^([A-Za-z][A-Za-z0-9 _-]*):[ \t]*(.*)$/
const NOTE = String.raw`\[\[(?:(?!\]\])[\s\S])*\]\]`
const BONEYARD = String.raw`\/\*(?:(?!\*\/)[\s\S])*\*\/`
const isBlank = (l: string) => l.trim() === '' && !/^ {2,}$/.test(l)

export function parseFountain(input: string): FountainResult {
  const counts = new Map<SkippedConstruct, number>()
  const bump = (k: SkippedConstruct) => counts.set(k, (counts.get(k) ?? 0) + 1)

  let text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const strip = (body: string, key: SkippedConstruct) => {
    const hit = () => {
      bump(key)
      return ''
    }
    text = text.replace(new RegExp(`^[ \\t]*${body}[ \\t]*(?:\\n|$)`, 'gm'), hit).replace(new RegExp(body, 'g'), hit)
  }
  strip(BONEYARD, 'boneyard')
  strip(NOTE, 'note')

  let lines = text.split('\n')
  const titlePage: Record<string, string> = {}
  let end = 0
  while (end < lines.length && lines[end]!.trim() !== '') end++
  const head = lines.slice(0, end)
  if (head.length && head.every((l, i) => (i === 0 ? KEY_RE.test(l) : KEY_RE.test(l) || /^\s/.test(l)))) {
    let key = ''
    const parts: Record<string, string[]> = {}
    for (const l of head) {
      const m = KEY_RE.exec(l)
      if (m && !/^\s/.test(l)) {
        key = m[1]!.trim().toLowerCase()
        parts[key] = m[2]!.trim() ? [m[2]!.trim()] : []
      } else if (l.trim()) parts[key]!.push(l.trim())
    }
    for (const [k, v] of Object.entries(parts)) titlePage[k] = v.join('\n')
    bump('titlePage')
    lines = lines.slice(end)
  }

  const emph = (l: string) => {
    const s = l.replace(/\\\*/g, '\uE000').replace(/\\_/g, '\uE001')
    const t = s
      .replace(/(\*{1,3})(?=[^\s*])([^*]+?)(?<=[^\s*])\1/g, '$2')
      .replace(/(?<![\p{L}\p{N}_\uE001])_(?=[^\s_])([^_]+?)(?<=[^\s_])_(?![\p{L}\p{N}_])/gu, '$1')
    if (t !== s) bump('emphasis')
    return t.replace(/\uE000/g, '*').replace(/\uE001/g, '_')
  }
  lines = lines.map(emph)

  type Seq = { title: string; scenes: { title: string; elements: FountainElement[] }[] }
  const sequences: Seq[] = []
  let seq: Seq | null = null
  let scene: Seq['scenes'][number] | null = null
  let hasHeading = false
  const newSeq = (title: string) => sequences.push((seq = { title, scenes: [] }))
  const add = (type: ElementType, t: string) => {
    if (!seq) newSeq('')
    if (!scene) seq!.scenes.push((scene = { title: '', elements: [] }))
    scene.elements.push({ type, text: t })
  }
  const actions = (ls: string[], lyrics: boolean) => {
    const out = ls.map((l) => {
      if (isBlank(l) || /^ {2,}$/.test(l)) return ''
      if (lyrics && l.trimStart().startsWith('~')) {
        bump('lyrics')
        return l.trimStart().slice(1).trimEnd()
      }
      return l.trimEnd()
    })
    const t = out.join('\n')
    if (t.trim()) add('action', t)
  }
  const dialogue = (ls: string[]) => {
    let buf: string[] = []
    const flush = () => {
      const t = buf.join('\n')
      if (t.trim()) add('dialogue', t)
      buf = []
    }
    for (const l of ls) {
      const t = l.trim()
      if (/^\(.*\)$/.test(t)) {
        flush()
        add('parenthetical', t)
      } else buf.push(t)
    }
    flush()
  }

  const block = (ls: string[]): void => {
    while (ls.length && ls[0]!.trim() === '') ls = ls.slice(1)
    if (!ls.length) return
    const l0 = ls[0]!.trim()
    const rest = ls.slice(1)
    if (l0.startsWith('!')) return actions([ls[0]!.trimStart().slice(1), ...rest], false)
    if (l0.startsWith('#')) {
      newSeq(l0.replace(/^#+\s*/, ''))
      scene = null
      return block(rest)
    }
    if (/^={3,}$/.test(l0)) {
      bump('pageBreak')
      return block(rest)
    }
    if (l0.startsWith('=')) {
      bump('synopsis')
      return block(rest)
    }
    const heading = (h: string) => {
      const m = /\s*#([^#\s]+)#\s*$/.exec(h)
      if (m) {
        bump('sceneNumber')
        h = h.slice(0, m.index)
      }
      hasHeading = true
      if (!seq) newSeq('')
      seq!.scenes.push((scene = { title: h, elements: [{ type: 'sceneHeading', text: h }] }))
      actions(rest, false)
    }
    if (/^\.(?!\.)/.test(l0)) return heading(l0.slice(1).trim())
    if (l0.startsWith('@')) {
      add('character', l0.slice(1).trim())
      return dialogue(rest)
    }
    if (l0.startsWith('>')) {
      if (l0.endsWith('<')) {
        bump('centered')
        add('action', l0.slice(1, -1).trim())
      } else add('transition', l0.slice(1).trim())
      return actions(rest, false)
    }
    if (HEADING_RE.test(l0)) return heading(l0)
    if (!rest.length && isTransitionLine(l0)) return add('transition', l0)
    if (rest.length && isCueLine(l0)) {
      if (l0.endsWith('^')) {
        bump('dualDialogue')
        add('character', l0.slice(0, -1).trim())
      } else add('character', l0)
      return dialogue(rest)
    }
    actions(ls, true)
  }

  let cur: string[] = []
  for (const l of [...lines, '']) {
    if (/^={3,}$/.test(l.trim()) && cur.length === 0) {
      bump('pageBreak')
    } else if (isBlank(l)) {
      if (cur.length) block(cur)
      cur = []
    } else cur.push(l)
  }

  const all = sequences.flatMap((s) => s.scenes)
  if (!hasHeading) {
    const elements = all.flatMap((s) => s.elements).map((e) => ({ type: 'action' as const, text: e.text }))
    return {
      sequences: elements.length ? [{ title: '', scenes: [{ title: '', elements }] }] : [],
      titlePage,
      skipped: skippedList(counts),
      noSceneHeadings: true,
    }
  }
  return { sequences, titlePage, skipped: skippedList(counts), noSceneHeadings: false }
}

const skippedList = (counts: Map<SkippedConstruct, number>) =>
  ORDER.filter((k) => counts.get(k)).map((construct) => ({ construct, count: counts.get(construct)! }))
