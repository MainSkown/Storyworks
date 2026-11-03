import { describe, expect, it } from 'vitest'
import { MAX_STEPS, type ShownLine } from './playthrough'
import {
  advanceStory,
  chooseStory,
  followArrow,
  resetStory,
  startStory,
  viewStory,
  type StoryModel,
  type StoryResolved,
  type StoryState,
} from './storyPlaythrough'
import { conversationSchema, type Conversation } from '../project/schemas/conversation'
import type { StoryMap } from '../project/schemas/storyMap'
import type { Variable } from '../project/schemas/variables'

const vars: Variable[] = [
  { id: 'f', name: 'met', type: 'flag', default: false },
  { id: 'n', name: 'gold', type: 'number', default: 10 },
]

let counter = 0
const line = (text: string) => ({
  type: 'line',
  attrs: { id: `b${++counter}`, lineId: `L${String(counter).padStart(6, '0')}` },
  content: [{ type: 'text', text }],
})
const lines = (id: string, next: string | null, text = 'hi', extra = {}) => ({
  id, type: 'lines', x: 0, y: 0, sets: [], next, content: { type: 'doc', content: [line(text)] }, ...extra,
})
const choice = (id: string, options: unknown[]) => ({ id, type: 'choice', x: 0, y: 0, sets: [], options })
const opt = (id: string, target: string | null, extra = {}) => ({ id, text: `text ${id}`, target, sets: [], ...extra })
const jump = (id: string, extra = {}) => ({ id, type: 'jump', x: 0, y: 0, sets: [], target: null, ...extra })
const end = (id: string) => ({ id, type: 'end', x: 0, y: 0, sets: [] })
const conv = (id: string, startNodeId: string | null, nodes: unknown[]): Conversation =>
  conversationSchema.parse({ version: 3, id, title: id, startNodeId, nodes })
const script = (...texts: string[]): StoryResolved => ({
  kind: 'script',
  title: 'Script',
  lines: texts.map((text, i): ShownLine => ({ lineId: `S${i}`, kind: 'speech', text })),
})
const cv = (c: Conversation): StoryResolved => ({ kind: 'conversation', title: c.id, conversation: c })

const flag = (op: 'isTrue' | 'isFalse') => ({ mode: 'all' as const, terms: [{ variableId: 'f', op }] })

interface World {
  items?: Record<string, StoryResolved>
  boxes: Record<string, { itemId?: string; text?: string; start?: boolean }>
  arrows?: { id: string; from: string; to: string; condition?: unknown }[]
}
function model(w: World): StoryModel {
  const map = {
    version: 1,
    boxes: Object.entries(w.boxes).map(([id, b], i) =>
      b.itemId !== undefined
        ? { id, kind: 'item', itemId: b.itemId, x: i, y: 0, start: !!b.start }
        : { id, kind: 'beat', text: b.text ?? '', x: i, y: 0, start: !!b.start },
    ),
    arrows: w.arrows ?? [],
  } as StoryMap
  return {
    map,
    variables: vars,
    resolve: (id) => w.items?.[id] ?? { kind: 'missing' },
  }
}
const stopOf = (s: StoryState) => (viewStory(s).kind === 'stopped' ? (viewStory(s) as { reason: { kind: string } }).reason : null)

describe('story play-through', () => {
  it('starts a conversation box, plays it to the end, and with no arrows the story ends', () => {
    const w: World = { items: { c1: cv(conv('c1', 'a', [lines('a', 'z'), end('z')])) }, boxes: { b1: { itemId: 'c1' } } }
    let s = startStory(model(w), { boxId: 'b1' })
    expect(viewStory(s)).toMatchObject({ kind: 'lines', itemId: 'c1', title: 'c1' })
    s = advanceStory(s)
    expect(viewStory(s)).toEqual({ kind: 'end' })
  })

  it('a cross-link switches item, keeps variables, and starts at the linked node', () => {
    const c1 = conv('c1', 'a', [
      choice('a', [opt('o1', null, { link: { itemId: 'c2', nodeId: 'y' }, sets: [{ variableId: 'n', op: 'add', value: 5 }] })]),
    ])
    const c2 = conv('c2', 'x', [lines('x', null, 'first'), lines('y', 'z', 'second'), end('z')])
    const w: World = { items: { c1: cv(c1), c2: cv(c2) }, boxes: { b1: { itemId: 'c1' }, b2: { itemId: 'c2' } } }
    let s = startStory(model(w), { boxId: 'b1' })
    s = chooseStory(s, 'o1')
    expect(viewStory(s)).toMatchObject({ kind: 'lines', itemId: 'c2', lines: [{ text: 'second' }] })
    expect(s.values.n).toBe(15)
  })

  it('a link without a node starts at the start node of the target', () => {
    const c1 = conv('c1', 'a', [jump('a', { link: { itemId: 'c2' } })])
    const c2 = conv('c2', 'x', [lines('x', null, 'first')])
    const s = startStory(model({ items: { c1: cv(c1), c2: cv(c2) }, boxes: { b1: { itemId: 'c1' } } }), { boxId: 'b1' })
    expect(viewStory(s)).toMatchObject({ kind: 'lines', itemId: 'c2', lines: [{ text: 'first' }] })
  })

  it('a link to a script shows its lines, then continues by arrow', () => {
    const c1 = conv('c1', 'a', [jump('a', { link: { itemId: 's1' } })])
    const w: World = {
      items: { c1: cv(c1), s1: script('One', 'Two'), c2: cv(conv('c2', 'x', [lines('x', null, 'after')])) },
      boxes: { b1: { itemId: 'c1' }, b2: { itemId: 's1' }, b3: { itemId: 'c2' } },
      arrows: [{ id: 'a1', from: 'b2', to: 'b3' }],
    }
    let s = startStory(model(w), { boxId: 'b1' })
    expect(viewStory(s)).toMatchObject({ kind: 'script', itemId: 's1', lines: [{ text: 'One' }, { text: 'Two' }] })
    s = advanceStory(s)
    expect(viewStory(s)).toMatchObject({ kind: 'item-end', arrows: [{ id: 'a1', toTitle: 'c2' }] })
    s = followArrow(s, 'a1')
    expect(viewStory(s)).toMatchObject({ kind: 'lines', itemId: 'c2', lines: [{ text: 'after' }] })
  })

  it('a conversation that reaches End offers the outgoing arrows whose condition holds', () => {
    const c1 = conv('c1', 'a', [lines('a', 'z', 'x', { sets: [{ variableId: 'f', op: 'set', value: true }] }), end('z')])
    const w: World = {
      items: { c1: cv(c1), s1: script('A'), s2: script('B') },
      boxes: { b1: { itemId: 'c1' }, b2: { itemId: 's1' }, b3: { itemId: 's2' } },
      arrows: [
        { id: 'a1', from: 'b1', to: 'b2', condition: flag('isTrue') },
        { id: 'a2', from: 'b1', to: 'b3', condition: flag('isFalse') },
      ],
    }
    let s = startStory(model(w), { boxId: 'b1' })
    s = advanceStory(s)
    const v = viewStory(s)
    expect(v).toMatchObject({ kind: 'item-end' })
    expect(v.kind === 'item-end' && v.arrows.map((a) => a.id)).toEqual(['a1'])
  })

  it('arrows exist but none passes: stops naming the box', () => {
    const w: World = {
      items: { c1: cv(conv('c1', 'a', [end('a')])), s1: script('A') },
      boxes: { b1: { itemId: 'c1' }, b2: { itemId: 's1' } },
      arrows: [{ id: 'a1', from: 'b1', to: 'b2', condition: flag('isTrue') }],
    }
    const s = startStory(model(w), { boxId: 'b1' })
    expect(stopOf(s)).toMatchObject({ kind: 'no-arrow-passes', boxId: 'b1' })
  })

  it('an arrow condition on an undefined variable stops naming it', () => {
    const bad = { mode: 'all', terms: [{ variableId: 'gone', op: 'isTrue' }] }
    const w: World = {
      items: { c1: cv(conv('c1', 'a', [end('a')])), s1: script('A') },
      boxes: { b1: { itemId: 'c1' }, b2: { itemId: 's1' } },
      arrows: [{ id: 'a1', from: 'b1', to: 'b2', condition: bad }],
    }
    expect(stopOf(startStory(model(w), { boxId: 'b1' }))).toMatchObject({ kind: 'undefined-variable', variableId: 'gone' })
  })

  it('a link to a missing or trashed item stops with the reason', () => {
    const c1 = conv('c1', 'a', [jump('a', { link: { itemId: 'gone' } })])
    const w: World = { items: { c1: cv(c1) }, boxes: { b1: { itemId: 'c1' } } }
    expect(stopOf(startStory(model(w), { boxId: 'b1' }))).toMatchObject({ kind: 'broken-link', reason: 'item-missing' })
    const t: World = { items: { c1: cv(c1), gone: { kind: 'trashed', title: 'Old' } }, boxes: { b1: { itemId: 'c1' } } }
    expect(stopOf(startStory(model(t), { boxId: 'b1' }))).toMatchObject({ kind: 'broken-link', reason: 'item-trashed' })
  })

  it('a link to a node that does not exist stops with node-missing', () => {
    const c1 = conv('c1', 'a', [jump('a', { link: { itemId: 'c2', nodeId: 'nope' } })])
    const w: World = { items: { c1: cv(c1), c2: cv(conv('c2', 'x', [end('x')])) }, boxes: { b1: { itemId: 'c1' } } }
    expect(stopOf(startStory(model(w), { boxId: 'b1' }))).toMatchObject({ kind: 'broken-link', reason: 'node-missing' })
  })

  it('a start box whose item is gone stops', () => {
    const w: World = { boxes: { b1: { itemId: 'gone' } } }
    expect(stopOf(startStory(model(w), { boxId: 'b1' }))).toMatchObject({ kind: 'broken-box', boxId: 'b1' })
  })

  it('a beat box shows its note, then continues by arrow', () => {
    const w: World = {
      items: { s1: script('A') },
      boxes: { b1: { text: 'Storm hits' }, b2: { itemId: 's1' } },
      arrows: [{ id: 'a1', from: 'b1', to: 'b2' }],
    }
    let s = startStory(model(w), { boxId: 'b1' })
    expect(viewStory(s)).toMatchObject({ kind: 'beat', text: 'Storm hits' })
    s = advanceStory(s)
    s = followArrow(s, 'a1')
    expect(viewStory(s)).toMatchObject({ kind: 'script', itemId: 's1' })
  })

  it('a loop across items continues, and a runaway loop stops at the step cap', () => {
    const c1 = conv('c1', 'a', [jump('a', { link: { itemId: 'c2' } })])
    const c2 = conv('c2', 'x', [jump('x', { link: { itemId: 'c1' } })])
    const w: World = { items: { c1: cv(c1), c2: cv(c2) }, boxes: { b1: { itemId: 'c1' } } }
    const s = startStory(model(w), { boxId: 'b1' })
    expect(stopOf(s)).toMatchObject({ kind: 'step-limit' })
    expect(s.steps).toBeLessThanOrEqual(MAX_STEPS)
  })

  it('a loop that gives the player choices shows the loop flag on the repeat', () => {
    const c1 = conv('c1', 'a', [choice('a', [opt('o1', null, { link: { itemId: 'c2' } })])])
    const c2 = conv('c2', 'x', [choice('x', [opt('o2', null, { link: { itemId: 'c1' } })])])
    const w: World = { items: { c1: cv(c1), c2: cv(c2) }, boxes: { b1: { itemId: 'c1' } } }
    let s = startStory(model(w), { boxId: 'b1' })
    s = chooseStory(s, 'o1')
    s = chooseStory(s, 'o2')
    expect(viewStory(s)).toMatchObject({ kind: 'choice', itemId: 'c1', loop: true })
  })

  it('starts from an item directly, at its start node or a given node', () => {
    const c1 = conv('c1', 'a', [lines('a', 'b', 'one'), lines('b', null, 'two')])
    const w: World = { items: { c1: cv(c1) }, boxes: {} }
    expect(viewStory(startStory(model(w), { itemId: 'c1' }))).toMatchObject({ lines: [{ text: 'one' }] })
    expect(viewStory(startStory(model(w), { itemId: 'c1', nodeId: 'b' }))).toMatchObject({ lines: [{ text: 'two' }] })
  })

  it('an item without a box that finishes ends the story', () => {
    const w: World = { items: { c1: cv(conv('c1', 'a', [end('a')])) }, boxes: {} }
    expect(viewStory(startStory(model(w), { itemId: 'c1' }))).toEqual({ kind: 'end' })
  })

  it('reset restores defaults and the original start; nothing is mutated', () => {
    const c1 = conv('c1', 'a', [lines('a', 'z', 'x', { sets: [{ variableId: 'n', op: 'add', value: 5 }] }), end('z')])
    const w: World = { items: { c1: cv(c1) }, boxes: { b1: { itemId: 'c1' } } }
    const s0 = startStory(model(w), { boxId: 'b1' })
    const s1 = advanceStory(s0)
    expect(s0.values.n).toBe(15)
    expect(viewStory(s1)).toEqual({ kind: 'end' })
    const r = resetStory(s1)
    expect(r.values.n).toBe(15)
    expect(r.log.length).toBeLessThan(3)
    expect(viewStory(r)).toMatchObject({ kind: 'lines' })
  })

  it('the log lists item headers, lines and the chosen option text', () => {
    const c1 = conv('c1', 'a', [lines('a', 'b', 'hello'), choice('b', [opt('o1', null, { link: { itemId: 's1' } })])])
    const w: World = { items: { c1: cv(c1), s1: script('Script line') }, boxes: { b1: { itemId: 'c1' } } }
    let s = startStory(model(w), { boxId: 'b1' })
    s = advanceStory(s)
    s = chooseStory(s, 'o1')
    expect(s.log.map((e) => e.type)).toEqual(['item', 'lines', 'choice', 'item', 'lines'])
    expect(s.log[2]).toMatchObject({ type: 'choice', text: 'text o1' })
  })

  it('invalid operations return the same state', () => {
    const w: World = { items: { c1: cv(conv('c1', 'a', [lines('a', 'z'), end('z')])) }, boxes: { b1: { itemId: 'c1' } } }
    const s = startStory(model(w), { boxId: 'b1' })
    expect(chooseStory(s, 'o1')).toBe(s)
    expect(followArrow(s, 'a1')).toBe(s)
  })

  it('an engine stop inside a conversation is reported with the item', () => {
    const c1 = conv('c1', 'a', [lines('a', null)])
    const w: World = { items: { c1: cv(c1) }, boxes: { b1: { itemId: 'c1' } } }
    const s = advanceStory(startStory(model(w), { boxId: 'b1' }))
    expect(viewStory(s)).toMatchObject({ kind: 'stopped', itemId: 'c1', reason: { kind: 'missing-target' } })
  })
})
