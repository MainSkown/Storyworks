import { countWords } from '../editor/wordCount'
import { imageExt } from '../editor/projectImage'
import type { ManuscriptNode } from '../project/schemas/manifest'
import { decodeUtf8, type ImportError } from './decode'
import { parseMarkdown, parsePlainText, type PMNode } from './parse'
import { splitBlocks, type SplitRule } from './split'

export interface ImportFile {
  name: string
  bytes: Uint8Array
  /** Bytes of a local image named in the file (path as written); null = not found. Absent = none can be read. */
  readAsset?: (ref: string) => Promise<Uint8Array | null>
}

export interface LoadedFile {
  name: string
  /** file name without folder and extension */
  base: string
  plain: boolean
  blocks: PMNode[]
}
export interface LoadedImport {
  files: LoadedFile[]
}

export type LoadResult = { ok: true; loaded: LoadedImport } | { ok: false; errors: ImportError[] }

/** Decodes and parses every file. One invalid file rejects the whole import (nothing is built). */
export function loadImport(files: ImportFile[]): LoadResult {
  const errors: ImportError[] = []
  const loaded: LoadedFile[] = []
  for (const f of files) {
    const d = decodeUtf8(f.name, f.bytes)
    if (!d.ok) {
      errors.push(d.error)
      continue
    }
    const plain = /\.txt$/i.test(f.name)
    loaded.push({
      name: f.name,
      base: f.name.split(/[\\/]/).pop()!.replace(/\.[^.]*$/, ''),
      plain,
      blocks: plain ? parsePlainText(d.text) : parseMarkdown(d.text),
    })
  }
  return errors.length ? { ok: false, errors } : { ok: true, loaded: { files: loaded } }
}

export type Placement = { kind: 'end' } | { kind: 'after'; id: string }

export interface PlanScene {
  id: string
  title: string
  included: boolean
  words: number
  /** ProseMirror doc without block ids (apply adds them) */
  content: { type: 'doc'; content: PMNode[] }
}
export interface PlanChapter {
  id: string
  title: string
  included: boolean
  /** words of the included scenes (0 when the chapter is skipped) */
  words: number
  /** index into the files given to loadImport */
  file: number
  scenes: PlanScene[]
}
export interface ImportWarning {
  code: 'remote-image' | 'unsupported-image' | 'missing-image'
  file: string
  ref: string
}
export interface PlanImage {
  file: number
  ref: string
}
export interface ImportPlan {
  chapters: PlanChapter[]
  warnings: ImportWarning[]
  /** local images referenced (deduplicated per file) */
  images: PlanImage[]
  placement: Placement
}

export interface PlanOptions {
  rule: SplitRule
  placement?: Placement
  /** Name of an untitled scene (n counts from 1 within its chapter). */
  sceneName?: (n: number) => string
  /** User changes by plan item id; they survive rebuilding the plan (e.g. after a rule change). */
  edits?: { titles?: Record<string, string>; skipped?: string[] }
}

export function classifyImage(ref: string): 'remote' | 'unsupported' | 'local' {
  if (/^([a-z][a-z0-9+.-]+:|\/\/)/i.test(ref)) return 'remote'
  return imageExt(ref.split(/[?#]/)[0]!) ? 'local' : 'unsupported'
}

export function imageRefs(nodes: PMNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'image') out.push(String(n.attrs?.src ?? ''))
    if (n.content) imageRefs(n.content, out)
  }
  return out
}

/** The preview tree: chapters and scenes with word counts, rename and skip flags applied. */
export function buildPlan(loaded: LoadedImport, opts: PlanOptions): ImportPlan {
  const skipped = new Set(opts.edits?.skipped ?? [])
  const titles = opts.edits?.titles ?? {}
  const sceneName = opts.sceneName ?? ((n: number) => `Scene ${n}`)
  const pick = (id: string, fallback: string) => titles[id]?.trim() || fallback
  const chapters: PlanChapter[] = []
  const warnings: ImportWarning[] = []
  const images: PlanImage[] = []

  loaded.files.forEach((file, fi) => {
    const seen = new Set<string>()
    for (const ref of imageRefs(file.blocks)) {
      if (seen.has(ref)) continue
      seen.add(ref)
      const kind = classifyImage(ref)
      if (kind === 'local') images.push({ file: fi, ref })
      else warnings.push({ code: kind === 'remote' ? 'remote-image' : 'unsupported-image', file: file.name, ref })
    }

    splitBlocks(file.blocks, file.plain ? 'break' : opts.rule).forEach((raw, ci) => {
      const id = `f${fi}-c${ci}`
      const scenes: PlanScene[] = raw.scenes.map((s, si) => {
        const content = { type: 'doc' as const, content: s.blocks }
        return {
          id: `${id}-s${si}`,
          title: pick(`${id}-s${si}`, s.title ?? sceneName(si + 1)),
          included: !skipped.has(`${id}-s${si}`),
          words: countWords(content),
          content,
        }
      })
      const included = !skipped.has(id)
      chapters.push({
        id,
        title: pick(id, raw.title ?? file.base),
        included,
        words: included ? scenes.reduce((n, s) => n + (s.included ? s.words : 0), 0) : 0,
        file: fi,
        scenes,
      })
    })
  })
  return { chapters, warnings, images, placement: opts.placement ?? { kind: 'end' } }
}

export interface Slot {
  parentId: string | null
  index: number
}

/** Where imported chapters go: end of the tree, or right after the selected item (its chapter if it is a scene). */
export function resolvePlacement(tree: ManuscriptNode[], placement: Placement): Slot {
  const end: Slot = { parentId: null, index: tree.length }
  if (placement.kind === 'end') return end
  const find = (nodes: ManuscriptNode[], parent: ManuscriptNode | null): Slot | null => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!
      if (n.id === placement.id) return { parentId: parent?.id ?? null, index: i + 1 }
      const hit = find(n.children, n)
      if (hit) {
        // Chapters can't sit inside a chapter: go after the chapter that holds the item.
        return n.type === 'chapter' ? { parentId: parent?.id ?? null, index: i + 1 } : hit
      }
    }
    return null
  }
  return find(tree, null) ?? end
}
