import { CODEX_KIND, type Link } from './links'

export interface CoverageInput {
  /** Every timeline node id. */
  nodeIds: readonly string[]
  /** Live scenes. */
  scenes: readonly { id: string; wordCount: number }[]
  links: readonly Link[]
  /** True when either end is gone; broken links do not count. Codex links never count (event coverage only). */
  isBroken: (link: Link) => boolean
}

export interface Coverage {
  nodesWithoutPassages: string[]
  scenesWithoutLinks: string[]
}

export function coverage({ nodeIds, scenes, links, isBroken }: CoverageInput): Coverage {
  const nodes = new Set<string>()
  const linked = new Set<string>()
  for (const l of links) {
    if (l.kind === CODEX_KIND || isBroken(l)) continue
    if (l.to.block !== undefined) nodes.add(l.to.block)
    linked.add(l.from.item)
  }
  return {
    nodesWithoutPassages: nodeIds.filter((id) => !nodes.has(id)),
    scenesWithoutLinks: scenes.filter((s) => s.wordCount > 0 && !linked.has(s.id)).map((s) => s.id),
  }
}
