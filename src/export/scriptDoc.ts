import { elementsOfDoc } from '../editor/screenplay/elements'
import { isElement } from '../editor/screenplay/rules'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { Scene } from '../project/schemas/scene'
import { ExportError } from './build'
import type { ExportWarning } from './model'
import type { ScriptDoc, ScriptScene, ScriptSequence } from './scriptModel'
import type { ScriptExportOptions } from './scriptOptions'

/** Everything screenplay export reads from the open project. */
export interface ScriptSource {
  meta: ScriptDoc['meta']
  titlePage: ScriptDoc['titlePage']
  manuscript: ManuscriptNode[]
  loadScene(path: string): Promise<{ ok: true; value: Scene } | { ok: false; message: string }>
  /** heading block id -> scene number, counted over the whole script */
  numbers: ReadonlyMap<string, number>
}

/** Folders in tree order (parts are looked through); scenes directly in the root form one untitled group. */
function groups(nodes: ManuscriptNode[]): { id: string; title: string; scenes: ManuscriptNode[] }[] {
  const out: { id: string; title: string; scenes: ManuscriptNode[] }[] = []
  let loose: ManuscriptNode[] = []
  const flush = () => {
    if (loose.length) out.push({ id: '', title: '', scenes: loose })
    loose = []
  }
  const walk = (list: ManuscriptNode[]) => {
    for (const n of list) {
      if (n.type === 'scene') loose.push(n)
      else if (n.type === 'part') walk(n.children)
      else {
        flush()
        out.push({ id: n.id, title: n.title, scenes: n.children.filter((c) => c.type === 'scene') })
      }
    }
  }
  walk(nodes)
  flush()
  return out
}

/**
 * Loads the selected sequences and builds the format-neutral screenplay. Scene numbers come from
 * the whole script, so exporting one sequence keeps its numbers. Loose root scenes always go in.
 */
export async function prepareScript(
  source: ScriptSource,
  selectedSequenceIds: string[],
  options: ScriptExportOptions,
): Promise<ScriptDoc> {
  const selected = new Set(selectedSequenceIds)
  const chosen = groups(source.manuscript).filter((g) => g.id === '' || selected.has(g.id))
  if (!chosen.length) throw new ExportError('nothingSelected')

  const warnings: ExportWarning[] = []
  const sequences: ScriptSequence[] = []
  for (const g of chosen) {
    const scenes: ScriptScene[] = []
    for (const sn of g.scenes) {
      const r = sn.path ? await source.loadScene(sn.path) : null
      if (!r || !r.ok) throw new ExportError('sceneUnreadable', sn.title)
      const kids = (r.value.content as { content?: { type?: unknown }[] } | null)?.content ?? []
      for (const k of kids)
        if (typeof k?.type !== 'string' || !isElement(k.type))
          warnings.push({ kind: 'unknownNode', detail: String(k?.type) })
      const elements = elementsOfDoc(r.value.content).map(({ key, ...el }) => {
        const number = key && options.sceneNumbers ? source.numbers.get(key) : undefined
        return number === undefined ? el : { ...el, number }
      })
      scenes.push({ id: sn.id, title: sn.title, elements })
    }
    sequences.push({ id: g.id, title: g.title, scenes })
  }
  return { meta: source.meta, titlePage: source.titlePage, options, sequences, warnings }
}
