import { BLOCK_ID_TYPES } from '../editor/blockIds'
import { makeBackupIfChanged, pruneBackups } from '../history/backups'
import { defaultEnv } from '../project/open'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { Env, ProjectIO } from '../project/types'
import { classifyImage, resolvePlacement, type ImportFile, type ImportPlan, type ImportWarning, type PlanChapter } from './plan'
import type { PMNode } from './parse'

/** The part of the project store the import uses. */
export interface ImportTarget {
  readonly tree: ManuscriptNode[]
  projectIO(): ProjectIO | null
  flush(): Promise<void>
  addChapter(parentId: string | null, title: string): Promise<string>
  addScene(
    parentId: string | null,
    title: string,
    init?: { content: Record<string, unknown>; wordCount: number },
  ): Promise<string>
  moveItem(id: string, parentId: string | null, index: number): Promise<boolean>
  addAsset(bytes: Uint8Array, ext: string): Promise<string>
}

export interface ApplyResult {
  chapters: number
  scenes: number
  words: number
  /** plan warnings plus images that could not be read at import time */
  warnings: ImportWarning[]
  /** name of the automatic backup made first (null = an up-to-date one already existed) */
  backup: string | null
  /** first created scene, for opening it afterwards */
  firstSceneId: string | null
}

const ID_TYPES = new Set(BLOCK_ID_TYPES)

/** Copy of the nodes with fresh block ids; images through `image` (null = drop the block). */
function prepare(nodes: PMNode[], newId: () => string, image: (n: PMNode) => PMNode | null): PMNode[] {
  const out: PMNode[] = []
  for (const n of nodes) {
    let next: PMNode | null = { ...n }
    if (n.type === 'image') next = image(n)
    if (!next) continue
    if (n.content) next.content = prepare(n.content, newId, image)
    if (ID_TYPES.has(n.type)) next.attrs = { ...next.attrs, id: newId() }
    out.push(next)
  }
  return out
}

const keepable = (c: PlanChapter) => c.included && c.scenes.some((s) => s.included)

/**
 * Creates the included chapters and scenes. Makes an automatic backup first; if that fails nothing is created.
 * Imported words are not counted as writing progress. A chapter with every scene skipped is not created.
 */
export async function applyImport(
  target: ImportTarget,
  plan: ImportPlan,
  files: ImportFile[],
  deps: { env?: Env; keepAuto?: number } = {},
): Promise<ApplyResult> {
  const env = deps.env ?? defaultEnv
  const chapters = plan.chapters.filter(keepable)
  const result: ApplyResult = {
    chapters: 0, scenes: 0, words: 0, warnings: [...plan.warnings], backup: null, firstSceneId: null,
  }
  if (!chapters.length) return result

  const io = target.projectIO()
  if (!io) throw new Error('No book is open.')
  await target.flush()
  result.backup = await makeBackupIfChanged(io, env)
  if (result.backup) await pruneBackups(io, { keepAuto: deps.keepAuto ?? 10 })

  // Each (file, ref) is copied once; null = unreadable.
  const copied = new Map<string, string | null>()
  const assetFor = async (fileIdx: number, ref: string): Promise<string | null> => {
    const key = `${fileIdx}\0${ref}`
    if (copied.has(key)) return copied.get(key)!
    const bytes = await files[fileIdx]?.readAsset?.(ref).catch(() => null)
    let path: string | null = null
    if (bytes) path = await target.addAsset(bytes, ref.split(/[?#]/)[0]!.split('.').pop()!)
    else result.warnings.push({ code: 'missing-image', file: files[fileIdx]?.name ?? '', ref })
    copied.set(key, path)
    return path
  }

  const slot = resolvePlacement(target.tree, plan.placement)
  let offset = 0
  for (const ch of chapters) {
    const chapterId = await target.addChapter(slot.parentId, ch.title)
    await target.moveItem(chapterId, slot.parentId, slot.index + offset++)
    result.chapters++
    for (const sc of ch.scenes.filter((s) => s.included)) {
      // Resolve images first (async), then build the doc synchronously.
      const resolved = new Map<string, string | null>()
      const collect = async (nodes: PMNode[]): Promise<void> => {
        for (const n of nodes) {
          if (n.type === 'image') {
            const ref = String(n.attrs?.src ?? '')
            if (classifyImage(ref) === 'local') resolved.set(ref, await assetFor(ch.file, ref))
          }
          if (n.content) await collect(n.content)
        }
      }
      await collect(sc.content.content)
      const content = {
        type: 'doc',
        content: prepare(sc.content.content, env.newId, (n) => {
          const path = resolved.get(String(n.attrs?.src ?? ''))
          return path ? { ...n, attrs: { ...n.attrs, src: path } } : null
        }),
      }
      const id = await target.addScene(chapterId, sc.title, { content, wordCount: sc.words })
      result.firstSceneId ??= id
      result.scenes++
      result.words += sc.words
    }
  }
  return result
}
