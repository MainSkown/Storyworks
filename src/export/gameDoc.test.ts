import { describe, expect, it } from 'vitest'
import { ExportError } from './build'
import { buildGameDoc } from './gameDoc'
import { gameSource } from './gameTestSource'

const build = async (over = {}) => buildGameDoc(gameSource(over))
const item = <T extends string>(doc: Awaited<ReturnType<typeof build>>, id: string, type: T) => {
  const i = doc.items.find((x) => x.id === id)
  if (!i || i.type !== type) throw new Error(`no ${type} ${id}`)
  return i as Extract<typeof i, { type: T }>
}

describe('buildGameDoc items', () => {
  it('lists folders, scripts and conversations in tree order with their parent', async () => {
    const doc = await build()
    expect(doc.items.map((i) => [i.id, i.type, i.parentId])).toEqual([
      ['f1', 'folder', null],
      ['s1', 'script', 'f1'],
      ['c1', 'conversation', 'f1'],
      ['c2', 'conversation', null],
    ])
  })

  it('keeps route refs and resolves names; a deleted branch has no name', async () => {
    const doc = await build()
    expect(item(doc, 's1', 'script').routes).toEqual([
      { timelineId: 't1', branchId: 'b1', name: 'Hero route' },
      { timelineId: 't1', branchId: 'b-gone', name: null },
    ])
    expect(doc.routes).toEqual([{ timelineId: 't1', branchId: 'b1', name: 'Hero route', timelineName: 'Main' }])
  })

  it('leaves out items that are not in the tree (trashed) and does not load them', async () => {
    const loaded: string[] = []
    const base = gameSource()
    const doc = await buildGameDoc({
      ...base,
      loadConversation: async (id) => (loaded.push(id), base.loadConversation(id)),
    })
    expect(doc.items.map((i) => i.id)).not.toContain('ct')
    expect(loaded).not.toContain('ct')
    expect(JSON.stringify(doc)).not.toContain('TRASHED-TEXT')
  })

  it('throws when a conversation cannot be read', async () => {
    await expect(build({ loadConversation: async () => ({ ok: false as const }) })).rejects.toBeInstanceOf(ExportError)
  })

  it('throws when a script cannot be read', async () => {
    await expect(build({ loadScriptLines: async () => null })).rejects.toBeInstanceOf(ExportError)
  })
})

describe('buildGameDoc script lines', () => {
  it('resolves speakers: codex name, plain name, none, deleted entry', async () => {
    const doc = await build()
    expect(item(doc, 's1', 'script').lines).toEqual([
      { lineId: 'L10', kind: 'speech', speakerId: 'e-gone', speakerName: null, text: 'From a deleted entry' },
      { lineId: 'L11', kind: 'speech', speakerId: null, speakerName: null, text: 'No speaker, with, commas' },
      { lineId: 'L12', kind: 'text', speakerId: null, speakerName: null, text: 'A description' },
      { lineId: 'L13', kind: 'speech', speakerId: 'e1', speakerName: 'Anna', text: 'Named' },
    ])
  })

  it('reads the codex name live, not the one stored on the line', async () => {
    const doc = await build({ entries: [{ id: 'e1', name: 'Anna Renamed' }] })
    expect(item(doc, 's1', 'script').lines[3]!.speakerName).toBe('Anna Renamed')
  })
})

describe('buildGameDoc conversations', () => {
  it('writes nodes by type without coordinates', async () => {
    const c = item(await build(), 'c1', 'conversation')
    expect(c.startNodeId).toBe('n1')
    expect(c.nodes.map((n) => n.type)).toEqual(['lines', 'choice', 'jump', 'end'])
    expect(JSON.stringify(c)).not.toMatch(/"[xy]":/)
    const n1 = c.nodes[0]!
    expect(n1).toMatchObject({
      next: 'n2',
      condition: { mode: 'all', terms: [{ variableId: 'v2', op: 'gte', value: 3 }] },
      sets: [{ variableId: 'v1', op: 'set', value: true }],
    })
    expect(n1.type === 'lines' && n1.lines.map((l) => [l.lineId, l.speakerName, l.text])).toEqual([
      ['L1', 'Anna', 'Hello, "friend"'],
      ['L2', 'Narrator', 'Line one\nline two'],
    ])
  })

  it('keeps option targets, links, conditions and sets; jump target is a node id', async () => {
    const c = item(await build(), 'c1', 'conversation')
    const choice = c.nodes[1]!
    if (choice.type !== 'choice') throw new Error('choice expected')
    expect(choice.options.map((o) => [o.id, o.target, o.link])).toEqual([
      ['o1', 'n3', undefined],
      ['o2', null, { itemId: 'c2', nodeId: 'm1' }],
      ['o3', null, undefined],
    ])
    expect(choice.options[0]!.condition?.mode).toBe('any')
    expect(choice.options[0]!.sets).toEqual([{ variableId: 'v2', op: 'add', value: 1 }])
    expect(c.nodes[2]).toMatchObject({ type: 'jump', target: 'n1' })
  })

  it('lists the edges between nodes only', async () => {
    const c = item(await build(), 'c1', 'conversation')
    expect(c.edges).toEqual([
      { id: 'next:n1', from: 'n1', to: 'n2' },
      { id: 'opt:o1', from: 'n2', to: 'n3', label: 'Yes' },
      { id: 'jump:n3', from: 'n3', to: 'n1' },
    ])
  })
})

describe('buildGameDoc story map', () => {
  it('keeps boxes and starts, drops boxes of items that are not exported and their arrows', async () => {
    const m = (await build()).storyMap
    expect(m.boxes.map((b) => b.id)).toEqual(['x1', 'x2', 'x3', 'x4'])
    expect(m.starts).toEqual(['x1'])
    expect(m.arrows.filter((a) => !a.derived).map((a) => a.id)).toEqual(['a1', 'a2'])
    expect(m.arrows.find((a) => a.id === 'a2')?.condition?.terms).toHaveLength(1)
  })

  it('adds arrows derived from cross-item links, marked as derived', async () => {
    const m = (await build()).storyMap
    expect(m.arrows.filter((a) => a.derived)).toEqual([
      { id: 'auto:x2>x3', from: 'x2', to: 'x3', derived: true, sources: [{ nodeId: 'n2', optionId: 'o2' }] },
    ])
  })
})

describe('buildGameDoc game document', () => {
  it('writes overview as plain text, categories, mechanics with parameters and named links, glossary', async () => {
    const g = (await build()).gameDocument
    expect(g.overview).toBe('A game about trust.')
    expect(g.categories).toEqual([{ id: 'k1', name: 'Combat', color: '#f00' }])
    expect(g.mechanics[0]).toMatchObject({
      id: 'm1', title: 'Dodge', summary: 'Roll away', categoryId: 'k1', status: 'implemented', tags: ['core'],
      description: 'Press space.',
      parameters: [{ id: 'p1', name: 'Cooldown', value: '2s' }],
      links: [
        { kind: 'variable', id: 'v2', name: 'trust' },
        { kind: 'item', id: 'c1', name: 'Talk' },
        { kind: 'entry', id: 'zzz', name: null },
      ],
    })
    expect(g.glossary).toEqual([{ id: 'g1', term: 'Trust', definition: 'How much Anna believes you.' }])
  })

  it('handles a missing overview', async () => {
    expect((await build({ overview: null })).gameDocument.overview).toBe('')
  })

  it('lists the variables', async () => {
    expect((await build()).variables.map((v) => v.name)).toEqual(['metAnna', 'trust'])
  })
})
