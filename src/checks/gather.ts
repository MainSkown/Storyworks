import { useCodexStore } from '../codex/store'
import { usePositionsForBlock } from '../knowledge/uses'
import { useKnowledgeStore } from '../knowledge/store'
import { blockSnippet, linkTargetMissing } from '../project/linkProblems'
import { CODEX_KIND, EVENT_KIND, KNOWLEDGE_KIND, type Link } from '../project/links'
import type { ManuscriptNode } from '../project/schemas/manifest'
import { useProjectStore } from '../project/store'
import { findNode } from '../project/tree'
import { useRelationsStore } from '../relations/store'
import { useRulesStore } from '../rules/store'
import { useStatesStore } from '../states/store'
import { useTimelinesStore } from '../timeline/store'
import type { CheckData } from './run'
import type { CheckState, KnowledgeUse, PassageUse } from './stateKnowledge'
import type { BrokenRef, FileProblem } from './structural'

const MISSING_ENTRY = 'Missing entry'
const DELETED_SCENE = 'Deleted scene'

function liveScenes(tree: readonly ManuscriptNode[]): ManuscriptNode[] {
  return tree.flatMap((n) => (n.type === 'scene' ? [n] : liveScenes(n.children)))
}

/**
 * Adapts the open project's stores into plain checker input. Scene files are read only for the few
 * scenes that hold a broken link or an entry/knowledge link (passage snippets); counts and to-dos
 * come from the in-memory scene index. Null when no project is open.
 */
export async function gatherCheckData(): Promise<CheckData | null> {
  const project = useProjectStore()
  const m = project.project?.manifest
  const ix = project.linkIndex()
  if (!m || !ix) return null
  const timelinesStore = useTimelinesStore()
  const codex = useCodexStore()
  const rulesStore = useRulesStore()
  const relations = useRelationsStore()
  const statesStore = useStatesStore()
  const knowledge = useKnowledgeStore()

  const timelines = timelinesStore.loadedTimelines
  const entries = codex.entries
  const entryName = new Map(entries.map((e) => [e.id, e.name]))
  const ruleIds = new Set(rulesStore.ruleEntries.map((r) => r.id))
  const kinds = statesStore.kinds
  const entryKinds = new Set(kinds.filter((k) => k.valueType === 'entry').map((k) => k.id))
  const nodeTitle = new Map(timelines.flatMap((t) => t.nodes.map((n) => [`${t.id}:${n.id}`, n.title])))
  const entryLabel = (id: string) => entryName.get(id) ?? MISSING_ENTRY

  const scenes = liveScenes(project.tree).map((n) => {
    const meta = project.sceneMeta.get(n.id)
    return {
      id: n.id,
      title: n.title,
      wordCount: meta?.wordCount ?? 0,
      todos: (meta?.openTodoIds ?? []).map((id) => ({ id, done: false })),
    }
  })
  const sceneIds = new Set(scenes.map((s) => s.id))

  const links: Link[] = [...ix.byOwner().values()].flat()
  const targetMissing = (l: Link) =>
    linkTargetMissing(l, {
      isBroken: ix.isBroken,
      nodeExists: (x) => nodeTitle.has(`${x.to.item}:${x.to.block}`),
    })
  const linkCheck = {
    targetMissing,
    passageMissing: ix.isPassageBroken,
    isBroken: (l: Link) => targetMissing(l) || ix.isPassageBroken(l),
  }

  const usable = (l: Link) =>
    l.from.block !== undefined && sceneIds.has(l.from.item) && !linkCheck.isBroken(l)
  const uses: PassageUse[] = []
  const knowledgeUses: KnowledgeUse[] = []
  const rawUses: { link: Link; entryId: string }[] = []
  for (const l of links) {
    if (!usable(l)) continue
    if (l.kind === CODEX_KIND && entryName.has(l.to.item)) rawUses.push({ link: l, entryId: l.to.item })
    else if (l.kind === KNOWLEDGE_KIND && l.to.entry !== undefined && entryName.has(l.to.entry))
      rawUses.push({ link: l, entryId: l.to.entry })
  }

  // Scenes whose text is needed: broken-link passages and uses.
  const wanted = new Set<string>()
  for (const l of links) if (!ix.isPassageBroken(l) && linkCheck.isBroken(l)) wanted.add(l.from.item)
  for (const u of rawUses) wanted.add(u.link.from.item)
  const snippets = new Map<string, string>()
  await Promise.all(
    [...wanted].map(async (sceneId) => {
      const path = findNode(project.tree, sceneId)?.path
      const r = path ? await project.loadScene(path) : null
      if (!r?.ok) return
      for (const l of links)
        if (l.from.item === sceneId && l.from.block !== undefined) {
          const s = blockSnippet(r.value.content, l.from.block)
          if (s !== null) snippets.set(`${sceneId}:${l.from.block}`, s)
        }
    }),
  )
  const sceneTitle = (id: string) =>
    findNode(project.tree, id)?.title ??
    project.trash.find((t) => t.id === id)?.title ??
    DELETED_SCENE
  const passageText = (sceneId: string, blockId: string | undefined) =>
    (blockId !== undefined ? snippets.get(`${sceneId}:${blockId}`) : undefined) ?? sceneTitle(sceneId)

  for (const { link, entryId } of rawUses) {
    const blockId = link.from.block as string
    const base = {
      blockId,
      sceneId: link.from.item,
      entryId,
      positions: usePositionsForBlock(links, link.from.item, blockId),
      label: passageText(link.from.item, blockId),
    }
    if (link.kind === CODEX_KIND) uses.push(base)
    else knowledgeUses.push({ ...base, itemId: link.to.item })
  }

  const brokenRefs: BrokenRef[] = []
  for (const t of timelines)
    for (const n of t.nodes) {
      const own = { ownerKind: 'node' as const, ownerId: t.id, ownerBlockId: n.id, ownerLabel: n.title }
      for (const id of n.codexIds) if (!entryName.has(id)) brokenRefs.push({ ...own, targetId: id })
      for (const id of n.ruleIds) if (!ruleIds.has(id)) brokenRefs.push({ ...own, targetId: id })
    }
  for (const e of entries) {
    const own = { ownerKind: 'entry' as const, ownerId: e.id, ownerLabel: e.name }
    for (const id of e.ruleIds) if (!ruleIds.has(id)) brokenRefs.push({ ...own, targetId: id })
    for (const s of e.states)
      if (entryKinds.has(s.kindId) && !entryName.has(s.value))
        brokenRefs.push({ ...own, targetId: s.value })
  }
  for (const r of relations.relationships) {
    const fromLive = entryName.has(r.fromId)
    const toLive = entryName.has(r.toId)
    if (fromLive === toLive) continue // both live is fine; both missing has no entry to point at
    const [owner, target] = fromLive ? [r.fromId, r.toId] : [r.toId, r.fromId]
    brokenRefs.push({
      ownerKind: 'entry',
      ownerId: owner,
      ownerLabel: entryLabel(owner),
      targetId: target,
    })
  }

  const states: CheckState[] = entries.flatMap((e) => e.states.map((s) => ({ ...s, entryId: e.id })))
  const knowledgeItems = knowledge.items.map((k) => ({
    id: k.id,
    name: k.title,
    learnings: k.learnings,
  }))
  const otherLinkedIds = [
    ...[...project.sceneMeta.values()].flatMap((s) => (s.povId ? [s.povId] : [])),
    ...states.filter((s) => entryKinds.has(s.kindId)).map((s) => s.value),
    ...knowledge.items.flatMap((k) => [
      ...k.learnings.map((l) => l.entryId),
      ...(k.about?.type === 'entry' ? [k.about.id] : []),
    ]),
  ]

  const otherRuleLinkedIds = knowledge.items.flatMap((k) =>
    k.about?.type === 'rule' ? [k.about.id] : [],
  )

  const titles = new Map<string, string>()
  const addTitles = (list: readonly { id: string; title?: string }[]) => {
    for (const r of list) if (r.title) titles.set(r.id, r.title)
  }
  const walk = (nodes: readonly ManuscriptNode[]) => {
    addTitles(nodes)
    for (const n of nodes) walk(n.children)
  }
  walk(m.manuscript)
  for (const list of [m.timelines, m.rules, m.ruleCategories, m.codexTypes, m.codexEntries, m.knowledge])
    addTitles(list)
  const problems: FileProblem[] = project.issues.map((i) =>
    i.kind === 'unlisted' ? i : { ...i, title: titles.get(i.itemId) },
  )

  return {
    calendar: timelinesStore.calendar,
    order: {
      calendar: timelinesStore.calendar,
      timeline: (id) => timelines.find((t) => t.id === id),
    },
    timelines,
    scenes,
    links,
    linkCheck,
    passageLabel: (l) => passageText(l.from.item, l.from.block),
    targetLabel: (l) => {
      if (l.kind === CODEX_KIND) return entryName.get(l.to.item) ?? null
      if (l.kind === EVENT_KIND) return nodeTitle.get(`${l.to.item}:${l.to.block}`) ?? null
      return null
    },
    brokenRefs,
    rules: rulesStore.rules.map((r) => ({ id: r.id, title: r.title })),
    entries,
    relationships: relations.relationships,
    groups: relations.groups,
    knowledgeItems,
    stateKinds: kinds,
    states,
    uses,
    knowledgeUses,
    entryLabel,
    valueLabel: (s) => (entryKinds.has(s.kindId) ? entryLabel(s.value) : s.value),
    otherLinkedIds,
    otherRuleLinkedIds,
    problems,
  }
}
