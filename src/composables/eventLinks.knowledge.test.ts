import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { LOCK_PATH } from '../project/lock'
import { useCodexStore } from '../codex/store'
import { useKnowledgeStore } from '../knowledge/store'
import { buildProblems } from '../project/linkProblems'
import {
  blockLinkInfoMap,
  linkSelectionToEntry,
  linkSelectionToKnowledge,
  linkSelectionToNode,
  linksForBlock,
  unlinkLink,
} from './eventLinks'

let io: MemoryProjectIO
beforeEach(() => {
  io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
  setActivePinia(createPinia())
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

async function opened() {
  const s = useProjectStore()
  await s.create('book', { title: 'B', author: 'A', language: 'en' })
  const codex = useCodexStore()
  const know = useKnowledgeStore()
  const scene = s.tree[0]!.children[0]!
  const anna = (await codex.createEntry({ name: 'Anna' }))!
  const boris = (await codex.createEntry({ name: 'Boris' }))!
  const secret = (await know.createItem({ title: 'The secret' }))!
  know.addLearning(secret, { entryId: anna, at: { node: { timelineId: 't1', nodeId: 'n1' } } })
  const links = () => s.linkIndex()!.linksFrom(scene.id)
  return { s, codex, know, id: scene.id, anna, boris, secret, links }
}

describe('link to knowledge pair', () => {
  it('adds one link per block and skips blocks already linked to that pair', async () => {
    const { id, anna, secret, links } = await opened()
    expect(await linkSelectionToKnowledge(id, ['a', 'b'], secret, anna)).toEqual({ ok: true, added: 2, skipped: 0 })
    expect(await linkSelectionToKnowledge(id, ['b', 'c', 'c'], secret, anna)).toEqual({ ok: true, added: 1, skipped: 1 })
    expect(links().every((l) => l.kind === 'knowledge' && l.to.item === secret && l.to.entry === anna)).toBe(true)
    expect(links()).toHaveLength(3)
  })

  it('the same item for another character is a different link', async () => {
    const { id, anna, boris, secret, links } = await opened()
    await linkSelectionToKnowledge(id, ['a'], secret, anna)
    expect(await linkSelectionToKnowledge(id, ['a'], secret, boris)).toEqual({ ok: true, added: 1, skipped: 0 })
    expect(links()).toHaveLength(2)
  })

  it('is refused when the project is read-only', async () => {
    const { s, id, anna, secret } = await opened()
    await s.close()
    io.files.set(LOCK_PATH, JSON.stringify({ machine: 'elsewhere', pid: 42, timestamp: Date.now() }))
    await s.open('book')
    await s.resolveLockPrompt('readOnly')
    expect(await linkSelectionToKnowledge(id, ['a'], secret, anna)).toEqual({ ok: false, reason: 'read-only' })
  })
})

describe('block links with knowledge', () => {
  it('shows item and character, whether the character learns it, and counts per kind', async () => {
    const { id, anna, boris, secret } = await opened()
    await linkSelectionToKnowledge(id, ['a'], secret, anna)
    await linkSelectionToKnowledge(id, ['a'], secret, boris)
    await linkSelectionToEntry(id, ['a'], anna)
    const rows = linksForBlock(id, 'a').filter((r) => r.kind === 'knowledge')
    expect(rows.map((r) => [r.knowledge?.itemTitle, r.knowledge?.entryName, r.knowledge?.learns, r.knowledgeMissing])).toEqual(
      expect.arrayContaining([
        ['The secret', 'Anna', true, null],
        ['The secret', 'Boris', false, null],
      ]),
    )
    expect(blockLinkInfoMap(id).get('a')).toMatchObject({ count: 3, broken: false, events: 0, entries: 1, knowledge: 2 })
  })

  it('a deleted item or trashed character makes the link broken and removable', async () => {
    const { id, anna, boris, secret, codex, know } = await opened()
    const other = (await know.createItem({ title: 'Other' }))!
    await linkSelectionToKnowledge(id, ['a'], secret, anna)
    await linkSelectionToKnowledge(id, ['a'], other, boris)
    await codex.deleteEntry(anna)
    await know.deleteItem(other)
    const rows = linksForBlock(id, 'a')
    expect(rows.every((r) => r.broken && r.knowledge === null)).toBe(true)
    expect(rows.map((r) => r.knowledgeMissing).sort()).toEqual(['entry', 'item'])
    expect(blockLinkInfoMap(id).get('a')).toMatchObject({ broken: true, knowledge: 2 })
    expect((await unlinkLink(rows[0]!.link.id)).ok).toBe(true)
    expect(linksForBlock(id, 'a')).toHaveLength(1)
  })

  it('problems for a knowledge link say knowledge-missing', async () => {
    const { s, id, anna, secret, codex } = await opened()
    await linkSelectionToKnowledge(id, ['a'], secret, anna)
    await codex.deleteEntry(anna)
    const ix = s.linkIndex()!
    const [p] = buildProblems(ix.linksFrom(id), {
      targetMissing: ix.isBroken,
      passageMissing: () => false,
    })
    expect(p!.reason).toBe('knowledge-missing')
  })

  it('a knowledge link on an event row does not change old event rows', async () => {
    const { id } = await opened()
    await linkSelectionToNode(id, ['a'], 't1', 'n1')
    const [row] = linksForBlock(id, 'a')
    expect(row).toMatchObject({ kind: 'event', knowledge: null, knowledgeMissing: null })
  })
})
