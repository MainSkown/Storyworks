import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCodexStore } from '../codex/store'
import { linkMention, scanMentions } from '../codex/mentionActions'
import { createMemoryFileIO } from '../io/fileIO'
import { createMemoryProjectIO } from '../project/io/memory'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { useRelationsStore } from '../relations/store'
import { useChecksStore } from './store'

beforeEach(() => {
  const io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

const para = (id: string, text: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
})

async function setup() {
  setActivePinia(createPinia())
  const project = useProjectStore()
  await project.create('book', { title: 'B', author: 'A', language: 'en' })
  const codex = useCodexStore()
  const anna = (await codex.createEntry({ name: 'Anna' })) as string
  const bea = (await codex.createEntry({ name: 'Bea' })) as string
  const scene = project.tree[0].children[0]
  await project.setSceneContent(scene.id, { type: 'doc', content: [para('b1', 'Anna came in.')] }, 3)
  return { project, codex, anna, bea, checks: useChecksStore() }
}

describe('gatherCheckData through the checks store', () => {
  it('reports a link to a deleted entry with the passage text', async () => {
    const { codex, anna, checks } = await setup()
    const [m] = await scanMentions(codex.entries.find((e) => e.id === anna)!)
    await linkMention(m!)
    await codex.deleteEntry(anna)
    await checks.run()
    const f = checks.findings.find((x) => x.checkId === 'broken-link')
    expect(f?.severity).toBe('error')
    expect(f?.locations[0]).toMatchObject({ kind: 'scene', blockId: 'b1', label: 'Anna came in.' })
  })

  it('reports a relationship to a deleted entry on the remaining entry', async () => {
    const { codex, anna, bea, checks } = await setup()
    const relations = useRelationsStore()
    const typeId = relations.types[0]!.id
    expect((await relations.createRelationship({ fromId: anna, toId: bea, typeId })).ok).toBe(true)
    await codex.deleteEntry(bea)
    await checks.run()
    const f = checks.findings.find((x) => x.checkId === 'broken-link')
    expect(f?.locations).toEqual([expect.objectContaining({ kind: 'entry', id: anna, label: 'Anna' })])
  })

  it('does not flag an entry used as a scene POV as unconnected', async () => {
    const { project, bea, checks } = await setup()
    await checks.run()
    expect(checks.findings.filter((f) => f.checkId === 'entry-no-connections')).toHaveLength(2)
    await project.setSceneMeta(project.tree[0].children[0].id, { povId: bea })
    await checks.run()
    const flagged = checks.findings.filter((f) => f.checkId === 'entry-no-connections')
    expect(flagged.map((f) => f.locations[0]!.label)).toEqual(['Anna'])
  })

  it('flags two entries of one type with the same name', async () => {
    const { codex, checks } = await setup()
    await codex.createEntry({ name: 'anna' })
    await checks.run()
    expect(checks.findings.map((f) => f.checkId)).toContain('duplicate-name')
  })
})
