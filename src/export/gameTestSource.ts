import type { ShownLine } from '../game/playthrough'
import type { Conversation } from '../project/schemas/conversation'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { GameSource } from './gameDoc'

/** Test-only fixture: a small game project as plain data. */
export const line = (
  lineId: string,
  text: string,
  speaker: { id?: string; name?: string } = {},
  kind: 'speech' | 'text' = 'speech',
) => ({
  type: 'line',
  attrs: {
    lineId,
    kind,
    ...(speaker.id ? { speakerId: speaker.id } : {}),
    ...(speaker.name ? { speakerName: speaker.name } : {}),
  },
  content: [{ type: 'text', text, marks: [{ type: 'comment', attrs: { id: 'cm1' } }] }],
})

const doc = (...lines: unknown[]) => ({ type: 'doc', content: lines })

export const talk: Conversation = {
  version: 3,
  id: 'c1',
  title: 'Talk',
  status: 'draft',
  synopsis: '',
  startNodeId: 'n1',
  nodes: [
    {
      id: 'n1', type: 'lines', x: 10, y: 20, sets: [{ variableId: 'v1', op: 'set', value: true }], next: 'n2',
      condition: { mode: 'all', terms: [{ variableId: 'v2', op: 'gte', value: 3 }] },
      content: doc(line('L1', 'Hello, "friend"', { id: 'e1' }), line('L2', 'Line one\nline two', { name: 'Narrator' })),
    },
    {
      id: 'n2', type: 'choice', x: 0, y: 0, sets: [],
      options: [
        { id: 'o1', text: 'Yes', target: 'n3', condition: { mode: 'any', terms: [{ variableId: 'v1', op: 'isTrue' }] }, sets: [{ variableId: 'v2', op: 'add', value: 1 }] },
        { id: 'o2', text: 'Go elsewhere', target: null, link: { itemId: 'c2', nodeId: 'm1' }, sets: [] },
        { id: 'o3', text: 'Nothing', target: null, sets: [] },
      ],
    },
    { id: 'n3', type: 'jump', x: 0, y: 0, sets: [], target: { nodeId: 'n1' } },
    { id: 'n4', type: 'end', x: 0, y: 0, sets: [] },
  ],
}

const other: Conversation = {
  ...talk,
  id: 'c2',
  title: 'Other',
  startNodeId: 'm1',
  nodes: [{ id: 'm1', type: 'lines', x: 0, y: 0, sets: [], next: null, content: doc(line('L9', 'Hi')) }],
}

const trashedConv: Conversation = {
  ...talk,
  id: 'ct',
  title: 'Gone',
  nodes: [{ id: 't1', type: 'lines', x: 0, y: 0, sets: [], next: null, content: doc(line('L99', 'TRASHED-TEXT')) }],
}

const scriptLines: Record<string, ShownLine[]> = {
  s1: [
    { lineId: 'L10', speakerId: 'e-gone', kind: 'speech', text: 'From a deleted entry' },
    { lineId: 'L11', kind: 'speech', text: 'No speaker, with, commas' },
    { lineId: 'L12', kind: 'text', text: 'A description' },
    { lineId: 'L13', speakerId: 'e1', kind: 'speech', text: 'Named' },
  ],
  st: [{ lineId: 'L98', kind: 'speech', text: 'TRASHED-TEXT' }],
}

const node = (id: string, type: ManuscriptNode['type'], title: string, children: ManuscriptNode[] = [], routes?: ManuscriptNode['routes']): ManuscriptNode => ({
  id, type, title, children, ...(type === 'chapter' || type === 'part' ? {} : { path: `${id}.json` }), ...(routes ? { routes } : {}),
})

export function gameSource(over: Partial<GameSource> = {}): GameSource {
  const convs: Record<string, Conversation> = { c1: talk, c2: other, ct: trashedConv }
  return {
    meta: { title: 'Game', author: 'Me', language: 'en' },
    variables: [
      { id: 'v1', name: 'metAnna', type: 'flag', default: false },
      { id: 'v2', name: 'trust', type: 'number', default: 0 },
    ],
    manuscript: [
      node('f1', 'chapter', 'Act 1', [
        node('s1', 'scene', 'Intro', [], [{ timelineId: 't1', branchId: 'b1' }, { timelineId: 't1', branchId: 'b-gone' }]),
        node('c1', 'conversation', 'Talk'),
      ]),
      node('c2', 'conversation', 'Other'),
    ],
    loadConversation: async (id) => (convs[id] ? { ok: true, value: convs[id]! } : { ok: false }),
    loadScriptLines: async (id) => scriptLines[id] ?? null,
    entries: [{ id: 'e1', name: 'Anna' }],
    timelines: [{ id: 't1', name: 'Main', branches: [{ id: 'b1', name: 'Hero route' }] }],
    storyMap: {
      version: 1,
      boxes: [
        { id: 'x1', kind: 'item', itemId: 's1', x: 0, y: 0, start: true },
        { id: 'x2', kind: 'item', itemId: 'c1', x: 0, y: 0, start: false },
        { id: 'x3', kind: 'item', itemId: 'c2', x: 0, y: 0, start: false },
        { id: 'x4', kind: 'beat', text: 'A twist', x: 0, y: 0, start: false },
        { id: 'xt', kind: 'item', itemId: 'ct', x: 0, y: 0, start: false },
      ],
      arrows: [
        { id: 'a1', from: 'x1', to: 'x2' },
        { id: 'a2', from: 'x2', to: 'x4', condition: { mode: 'all', terms: [{ variableId: 'v1', op: 'isTrue' }] } },
        { id: 'a3', from: 'x2', to: 'xt' },
      ],
    },
    overview: doc({ type: 'paragraph', content: [{ type: 'text', text: 'A game about trust.' }] }),
    categories: [{ version: 1, id: 'k1', name: 'Combat', color: '#f00' }],
    mechanics: [
      {
        version: 1, id: 'm1', title: 'Dodge', summary: 'Roll away', categoryId: 'k1', status: 'implemented', tags: ['core'],
        description: doc({ type: 'paragraph', content: [{ type: 'text', text: 'Press space.' }] }),
        parameters: [{ id: 'p1', name: 'Cooldown', value: '2s' }],
        links: [{ kind: 'variable', id: 'v2' }, { kind: 'item', id: 'c1' }, { kind: 'entry', id: 'zzz' }],
      },
    ],
    glossary: [{ id: 'g1', term: 'Trust', definition: 'How much Anna believes you.' }],
    linkNames: {
      variable: new Map([['v2', 'trust']]),
      item: new Map([['c1', 'Talk']]),
      beat: new Map(),
      entry: new Map(),
      mechanic: new Map(),
    },
    ...over,
  }
}
