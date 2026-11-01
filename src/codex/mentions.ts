import { CODEX_KIND, type Link } from '../project/links'
import type { CodexEntry } from '../project/schemas/codexEntry'

export interface MentionScene {
  id: string
  /** ProseMirror JSON of the scene body. */
  content: unknown
}

export interface TextRange {
  /** Offsets into `Mention.text` (UTF-16 code units, end exclusive). */
  start: number
  end: number
}

export interface Mention {
  /** Stable finding id: `mention:<entryId>:<blockId>`. */
  id: string
  entryId: string
  sceneId: string
  blockId: string
  /** The block's plain text as `blockTexts` returns it; `ranges` index into it. */
  text: string
  ranges: TextRange[]
}

export const mentionId = (entryId: string, blockId: string) => `mention:${entryId}:${blockId}`

interface PmNode {
  type?: string
  text?: string
  attrs?: { id?: unknown }
  content?: unknown
}

const INLINE = new Set(['text', 'footnote', 'hardBreak'])

function inlineText(kids: PmNode[]): string {
  let out = ''
  for (const k of kids) {
    if (k.type === 'text') out += k.text ?? ''
    else if (k.type === 'hardBreak') out += ' '
  }
  return out
}

/**
 * Text blocks (id-carrying nodes holding only inline content) in document order, with their plain
 * text: hard breaks become a space, footnote bodies are left out. Blocks without an id are skipped.
 */
export function blockTexts(content: unknown): { blockId: string; text: string }[] {
  const out: { blockId: string; text: string }[] = []
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const n = node as PmNode
    if (!Array.isArray(n.content)) return
    const kids = n.content as PmNode[]
    if (kids.length > 0 && kids.every((k) => INLINE.has(k?.type ?? ''))) {
      if (typeof n.attrs?.id === 'string') out.push({ blockId: n.attrs.id, text: inlineText(kids) })
      return
    }
    kids.forEach(walk)
  }
  walk(content)
  return out
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** One regex for the entry's name and aliases, or null when it has no usable name. */
function namePattern(entry: Pick<CodexEntry, 'name' | 'aliases'>): RegExp | null {
  const seen = new Set<string>()
  const names = [entry.name, ...entry.aliases]
    .map((n) => n.trim())
    .filter((n) => n !== '' && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
    .sort((a, b) => b.length - a.length) // longest first: "Anna Kowalska" before "Anna"
  if (names.length === 0) return null
  // \b is ASCII-only, so word edges are lookarounds over Unicode letters and digits.
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${names.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`,
    'giu',
  )
}

/**
 * Passages that name the entry (name or alias, whole word, any case) and are neither linked to it
 * (a `codex` link from that block) nor dismissed. One mention per block, with every hit's range.
 * Scenes and blocks come out in the order given; pass trashed scenes out.
 */
export function findMentions(
  entry: Pick<CodexEntry, 'id' | 'name' | 'aliases'>,
  scenes: readonly MentionScene[],
  links: readonly Link[],
  ignored: ReadonlySet<string>,
): Mention[] {
  const pattern = namePattern(entry)
  if (!pattern) return []
  const linked = new Set<string>()
  for (const l of links)
    if (l.kind === CODEX_KIND && l.to.item === entry.id && l.from.block !== undefined)
      linked.add(`${l.from.item}\u0000${l.from.block}`)

  const out: Mention[] = []
  for (const scene of scenes) {
    for (const { blockId, text } of blockTexts(scene.content)) {
      const id = mentionId(entry.id, blockId)
      if (ignored.has(id) || linked.has(`${scene.id}\u0000${blockId}`)) continue
      const ranges = [...text.matchAll(pattern)].map((m) => ({
        start: m.index,
        end: m.index + m[0].length,
      }))
      if (ranges.length > 0)
        out.push({ id, entryId: entry.id, sceneId: scene.id, blockId, text, ranges })
    }
  }
  return out
}
