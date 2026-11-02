import type { ManuscriptNode } from '../project/schemas/manifest'
import type { Scene } from '../project/schemas/scene'
import type {
  Align,
  ExportBlock,
  ExportChapter,
  ExportDoc,
  ExportFootnote,
  ExportWarning,
  Run,
} from './model'
import type { ExportOptions } from './options'

export class ExportError extends Error {
  constructor(
    readonly code: 'nothingSelected' | 'sceneMissing' | 'sceneUnreadable',
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'ExportError'
  }
}

export interface ExportInput {
  meta: ExportDoc['meta']
  manuscript: ManuscriptNode[]
  /** Keyed by scene id (the manuscript scene node's id). */
  scenes: Record<string, Scene>
  readAsset(path: string): Uint8Array | null
  selectedChapterIds: string[]
}

interface PmNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: PmNode[]
  text?: string
  marks?: { type: string }[]
}

const ALIGNS: readonly string[] = ['left', 'center', 'right', 'justify']

const alignOf = (n: PmNode): Align => {
  const a = n.attrs?.textAlign
  return typeof a === 'string' && ALIGNS.includes(a) ? (a as Align) : 'left'
}

/** Per-chapter state: footnote numbering and warnings. */
class Ctx {
  footnotes: ExportFootnote[] = []
  constructor(
    readonly warnings: ExportWarning[],
    readonly readAsset: ExportInput['readAsset'],
  ) {}
}

function inline(nodes: PmNode[] | undefined, ctx: Ctx): Run[] {
  const runs: Run[] = []
  for (const n of nodes ?? []) {
    if (n.type === 'text') {
      if (!n.text) continue
      const run: { text: string; bold?: boolean; italic?: boolean; underline?: boolean } = {
        text: n.text,
      }
      for (const m of n.marks ?? []) {
        if (m.type === 'bold') run.bold = true
        else if (m.type === 'italic') run.italic = true
        else if (m.type === 'underline') run.underline = true
        // comment and any other app-only mark: text kept, mark dropped
      }
      runs.push(run)
    } else if (n.type === 'hardBreak') {
      runs.push({ text: '\n' })
    } else if (n.type === 'footnote') {
      const num = ctx.footnotes.length + 1
      ctx.footnotes.push({ n: num, runs: inline(n.content, ctx) })
      runs.push({ footnote: num })
    } else {
      ctx.warnings.push({ kind: 'unknownNode', detail: String(n.type) })
    }
  }
  return runs
}

const isEmptyParagraph = (b: ExportBlock) => b.type === 'paragraph' && b.runs.length === 0

/** Text of a list item's paragraphs; nested lists are flattened into `items` at a deeper level. */
function listItems(list: PmNode, level: number, items: Run[][], levels: number[], ctx: Ctx): void {
  for (const li of list.content ?? []) {
    const runs: Run[] = []
    const nested: PmNode[] = []
    for (const c of li.content ?? []) {
      if (c.type === 'bulletList' || c.type === 'orderedList') nested.push(c)
      else {
        if (runs.length) runs.push({ text: ' ' })
        runs.push(...inline(c.content, ctx))
      }
    }
    items.push(runs)
    levels.push(level)
    for (const n of nested) listItems(n, level + 1, items, levels, ctx)
  }
}

function blockOf(n: PmNode, ctx: Ctx): ExportBlock[] {
  switch (n.type) {
    case 'paragraph':
      return [{ type: 'paragraph', runs: inline(n.content, ctx), align: alignOf(n) }]
    case 'heading': {
      const lvl = Number(n.attrs?.level)
      const level = (lvl >= 1 && lvl <= 3 ? Math.trunc(lvl) : 1) as 1 | 2 | 3
      return [{ type: 'heading', level, runs: inline(n.content, ctx), align: alignOf(n) }]
    }
    case 'blockquote': {
      const kids = n.content ?? []
      const own = alignOf(n)
      return [
        {
          type: 'quote',
          paragraphs: kids.map((k) => inline(k.content, ctx)),
          align: own !== 'left' || !kids[0] ? own : alignOf(kids[0]),
        },
      ]
    }
    case 'bulletList':
    case 'orderedList': {
      const items: Run[][] = []
      const levels: number[] = []
      listItems(n, 0, items, levels, ctx)
      return [{ type: 'list', ordered: n.type === 'orderedList', items, levels }]
    }
    case 'sceneBreak':
      return [{ type: 'sceneBreak' }]
    case 'image': {
      const path = typeof n.attrs?.src === 'string' ? n.attrs.src : ''
      const bytes = ctx.readAsset(path)
      if (!bytes) ctx.warnings.push({ kind: 'missingImage', detail: path })
      const width = n.attrs?.width
      return [
        {
          type: 'image',
          bytes: bytes ?? null,
          path,
          ...(typeof width === 'number' ? { width } : {}),
        },
      ]
    }
    default:
      ctx.warnings.push({ kind: 'unknownNode', detail: String(n.type) })
      return []
  }
}

function sceneBlocks(content: Scene['content'], ctx: Ctx): ExportBlock[] {
  const blocks = ((content as PmNode).content ?? []).flatMap((n) => blockOf(n, ctx))
  while (blocks.length && isEmptyParagraph(blocks[blocks.length - 1]!)) blocks.pop()
  return blocks
}

/** Selected chapters in manifest order, each with the title of its part. */
function collectChapters(
  nodes: ManuscriptNode[],
  selected: Set<string>,
  part?: ManuscriptNode,
  out: { node: ManuscriptNode; partTitle?: string }[] = [],
  seenParts = new Set<string>(),
) {
  for (const n of nodes) {
    if (n.type === 'part') {
      collectChapters(n.children, selected, n, out, seenParts)
    } else if (n.type === 'chapter' && selected.has(n.id)) {
      const first = part !== undefined && !seenParts.has(part.id)
      if (first) seenParts.add(part.id)
      out.push({ node: n, ...(first ? { partTitle: part.title } : {}) })
    }
  }
  return out
}

export function buildExportModel(input: ExportInput, options: ExportOptions): ExportDoc {
  const found = collectChapters(input.manuscript, new Set(input.selectedChapterIds))
  if (!found.length) throw new ExportError('nothingSelected')

  const warnings: ExportWarning[] = []
  const chapters: ExportChapter[] = found.map(({ node, partTitle }) => {
    const ctx = new Ctx(warnings, input.readAsset)
    const blocks: ExportBlock[] = []
    for (const sn of node.children.filter((c) => c.type === 'scene')) {
      const scene = input.scenes[sn.id]
      if (!scene) throw new ExportError('sceneMissing', sn.id)
      const sb = sceneBlocks(scene.content, ctx)
      if (!sb.length) continue
      if (blocks.length) blocks.push({ type: 'sceneBreak' })
      blocks.push(...sb)
    }
    return {
      id: node.id,
      title: node.title,
      ...(partTitle !== undefined ? { partTitle } : {}),
      blocks,
      footnotes: ctx.footnotes,
    }
  })

  return { meta: input.meta, options, chapters, appendices: [], warnings }
}
