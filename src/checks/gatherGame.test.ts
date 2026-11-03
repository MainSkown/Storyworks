import { describe, expect, it } from 'vitest'
import { conversationSchema, type Conversation } from '../project/schemas/conversation'
import type { Mechanic } from '../project/schemas/mechanic'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { StoryMap } from '../project/schemas/storyMap'
import type { Variable } from '../project/schemas/variables'
import { gatherGameData, type GameGatherSource } from './gatherGame'
import { runChecks, type CheckData } from './run'
import { brokenLinks } from './structural'

type N = Record<string, unknown>
const doc = { type: 'doc', content: [] }
const lines = (id: string, next: string | null = null): N => ({ id, type: 'lines', x: 0, y: 0, sets: [], content: doc, next })
const choice = (id: string, options: N[]): N => ({ id, type: 'choice', x: 0, y: 0, sets: [], options })
const opt = (id: string, target: string | null = null, extra: N = {}): N => ({ id, text: id, target, sets: [], ...extra })
const end = (id: string): N => ({ id, type: 'end', x: 0, y: 0, sets: [] })
const conv = (id: string, nodes: N[]): Conversation =>
  conversationSchema.parse({ version: 3, id, title: id, startNodeId: nodes[0]!.id, nodes })

const node = (id: string, type: ManuscriptNode['type']): ManuscriptNode => ({ id, type, title: `T-${id}`, children: [] })
const gold: Variable = { id: 'gold', name: 'Gold', type: 'number', default: 0 }
const mech = (id: string, over: Partial<Mechanic> = {}): Mechanic => ({
  version: 1, id, title: `Mech ${id}`, summary: '', categoryId: 'c', status: 'idea', tags: [],
  description: { type: 'doc', content: [] }, parameters: [], links: [], ...over,
})
const startMap = (...itemIds: string[]): StoryMap => ({
  version: 1,
  boxes: itemIds.map((itemId, i) => ({ kind: 'item' as const, id: `b-${itemId}`, itemId, x: 0, y: 0, start: i === 0 })),
  arrows: itemIds.slice(1).map((t) => ({ id: `a-${t}`, from: `b-${itemIds[0]}`, to: `b-${t}` })),
})

function source(convs: Conversation[], over: Partial<GameGatherSource> = {}): GameGatherSource {
  const byId = new Map(convs.map((c) => [c.id, c]))
  return {
    manifest: { manuscript: convs.map((c) => node(c.id, 'conversation')), trash: [] },
    loadConversation: async (id) => {
      const c = byId.get(id)
      return c ? { ok: true, value: c } : { ok: false }
    },
    loadScriptLines: async () => [],
    variables: [gold],
    codexIds: [],
    map: startMap(...convs.map((c) => c.id)),
    timelines: [],
    mechanics: [],
    mechanicIds: [],
    ...over,
  }
}

const good = () => conv('c1', [lines('n1', 'n2'), end('n2')])

// Minimal book-side input; only the game slice and refs matter here.
async function run(src: GameGatherSource) {
  const { game, refs } = await gatherGameData(src)
  const data = {
    links: [], linkCheck: { targetMissing: () => false, passageMissing: () => false, isBroken: () => false },
    passageLabel: () => '', targetLabel: () => null, brokenRefs: refs, game,
    timelines: [], scenes: [], rules: [], entries: [], relationships: [], groups: [], knowledgeItems: [],
    stateKinds: [], states: [], uses: [], knowledgeUses: [], otherLinkedIds: [], otherRuleLinkedIds: [], problems: [],
  } as unknown as CheckData
  return runChecks(data, 'game', () => true)
}
const ids = (f: { checkId: string }[]) => f.map((x) => x.checkId)

describe('gatherGameData', () => {
  it('a good small game has no findings', async () => {
    const findings = await run(source([good()], { variables: [] }))
    expect(findings).toEqual([])
  })

  it('finds a dead end, an unreachable item, an undefined variable and a broken mechanic link', async () => {
    const c1 = conv('c1', [
      lines('n1', 'n2'),
      choice('n2', [opt('o1', 'n3', { condition: { mode: 'all', terms: [{ variableId: 'ghost', op: 'gt', value: 1 }] } })]),
      lines('n3', null),
    ])
    const c2 = conv('c2', [end('e')])
    const src = source([c1, c2], {
      map: startMap('c1'),
      mechanics: [mech('m1', { links: [{ kind: 'item', id: 'gone' }] })],
      mechanicIds: ['m1'],
    })
    const found = ids(await run(src))
    expect(found).toEqual(
      expect.arrayContaining(['dead-end', 'unreachable-item', 'undefined-variable', 'mechanic-broken-link']),
    )
  })

  it('loads each live conversation once and skips trashed items', async () => {
    const calls: string[] = []
    const src = source([good()])
    src.manifest = { manuscript: [node('c1', 'conversation')], trash: [{
      id: 'c9', type: 'conversation', title: 'Old', originalPath: '', trashPath: '', parentId: null, index: 0, deletedAt: '',
    }] }
    const load = src.loadConversation
    src.loadConversation = async (id) => (calls.push(id), load(id))
    const { game } = await gatherGameData(src)
    expect(calls).toEqual(['c1'])
    expect(calls).not.toContain('c9')
    expect(game.graph.items.map((i) => [i.id, i.trashed])).toEqual([['c1', false], ['c9', true]])
  })

  it('collects speaker ids from scripts and conversations; a deleted codex entry is flagged', async () => {
    const withSpeaker = (id: string) => ({
      type: 'doc',
      content: [{ type: 'line', attrs: { id: 'x', lineId: 'L000001', speakerId: id, speakerName: null } }],
    })
    const c1 = conv('c1', [{ ...lines('n1'), content: withSpeaker('gone') }])
    const src = source([c1])
    src.manifest = { manuscript: [node('c1', 'conversation'), node('s1', 'scene')], trash: [] }
    src.loadScriptLines = async () => [{ lineId: 'L000002', speakerId: 'gone2', kind: 'speech', text: 'Hi' }]
    src.codexIds = ['alive']
    const found = (await run(src)).filter((f) => f.checkId === 'broken-speaker')
    expect(found.map((f) => f.id).sort()).toEqual(['broken-speaker:c1:gone', 'broken-speaker:s1:gone2'])
  })

  it('reports a dangling cross-link and a dangling node target under broken-link, with stable ids', async () => {
    const c1 = conv('c1', [
      choice('n1', [opt('o1', 'nope'), opt('o2', null, { link: { itemId: 'ghost' } })]),
      end('n2'),
    ])
    const a = (await run(source([c1]))).filter((f) => f.checkId === 'broken-link')
    const b = (await run(source([c1]))).filter((f) => f.checkId === 'broken-link')
    expect(a).toHaveLength(2)
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id))
    expect(a.map((f) => f.variant).sort()).toEqual(['node-target', 'ref'])
    expect(a[0]!.locations[0]).toMatchObject({ kind: 'item', id: 'c1', nodeId: 'n1' })
  })

  it('a cross-link into a trashed item is a broken link', async () => {
    const c1 = conv('c1', [choice('n1', [opt('o1', null, { link: { itemId: 'c9' } })])])
    const src = source([c1])
    src.manifest = { manuscript: [node('c1', 'conversation')], trash: [{
      id: 'c9', type: 'conversation', title: 'Old', originalPath: '', trashPath: '', parentId: null, index: 0, deletedAt: '',
    }] }
    const f = (await run(src)).filter((x) => x.checkId === 'broken-link')
    expect(f).toHaveLength(1)
  })

  it('tags items with their routes from the tree', async () => {
    const tagged = { ...node('c1', 'conversation'), routes: [{ timelineId: 't', branchId: 'b' }] }
    const src = source([good()])
    src.manifest = { manuscript: [tagged], trash: [] }
    src.timelines = [{ id: 't', name: 'T', branches: [{ id: 'b', name: 'B' }] }]
    const { game } = await gatherGameData(src)
    expect(game.graph.items[0]!.routes).toEqual([{ timelineId: 't', branchId: 'b' }])
    expect(game.graph.routes).toHaveLength(1)
  })

  it('an unusable conversation file is not judged', async () => {
    const src = source([good()])
    src.loadConversation = async () => ({ ok: false })
    src.variables = []
    expect(await run(src)).toEqual([])
  })
})

describe('broken-link output for books', () => {
  it('is unchanged when there is no game slice', () => {
    const f = brokenLinks({
      links: [], check: { targetMissing: () => false, passageMissing: () => false },
      passageLabel: () => '', targetLabel: () => null,
      refs: [{ ownerKind: 'entry', ownerId: 'e1', ownerLabel: 'Anna', targetId: 'r1' }],
    })
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ id: 'broken-link:e1:r1', variant: 'ref' })
  })
})
