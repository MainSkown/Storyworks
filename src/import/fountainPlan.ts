import { countWords } from '../editor/wordCount'
import type { FountainElement, FountainResult } from './fountain'
import type { ImportPlan, Placement, PlanChapter } from './plan'
import type { PMNode } from './parse'

export interface FountainPlanOptions {
  /** file name without extension: names the sequence of a file with no sections */
  fileBase: string
  placement?: Placement
  sceneName?: (n: number) => string
  sequenceName?: (n: number) => string
  /** User changes by plan item id; they survive rebuilding the plan. */
  edits?: { titles?: Record<string, string>; skipped?: string[] }
}

/** Scene doc of typed element blocks (ids are added when the plan is applied). */
export function fountainDoc(elements: FountainElement[]): { type: 'doc'; content: PMNode[] } {
  return {
    type: 'doc',
    content: elements.map((e): PMNode => {
      const content: PMNode[] = []
      e.text.split('\n').forEach((line, i) => {
        if (i > 0) content.push({ type: 'hardBreak' })
        if (line) content.push({ type: 'text', text: line })
      })
      return content.length ? { type: e.type, content } : { type: e.type }
    }),
  }
}

/** The import preview for a parsed Fountain file: sequences with their scenes, same shape the Markdown import uses. */
export function buildFountainPlan(result: FountainResult, opts: FountainPlanOptions): ImportPlan {
  const skipped = new Set(opts.edits?.skipped ?? [])
  const titles = opts.edits?.titles ?? {}
  const pick = (id: string, fallback: string) => titles[id]?.trim() || fallback
  const sceneName = opts.sceneName ?? ((n: number) => `Scene ${n}`)
  const sequenceName = opts.sequenceName ?? ((n: number) => `Sequence ${n}`)
  const chapters: PlanChapter[] = result.sequences.map((seq, ci) => {
    const id = `f0-c${ci}`
    const scenes = seq.scenes.map((s, si) => {
      const sid = `${id}-s${si}`
      const content = fountainDoc(s.elements)
      return {
        id: sid,
        title: pick(sid, s.title.trim() || sceneName(si + 1)),
        included: !skipped.has(sid),
        words: countWords(content),
        content,
      }
    })
    const included = !skipped.has(id)
    const fallback = seq.title.trim() || (result.sequences.length === 1 ? opts.fileBase : sequenceName(ci + 1))
    return {
      id,
      title: pick(id, fallback),
      included,
      words: included ? scenes.reduce((n, s) => n + (s.included ? s.words : 0), 0) : 0,
      file: 0,
      scenes,
    }
  })
  return { chapters, warnings: [], images: [], placement: opts.placement ?? { kind: 'end' } }
}
