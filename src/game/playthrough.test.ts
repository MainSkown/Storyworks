import { describe, expect, it } from 'vitest'
import { advance, choose, MAX_STEPS, reset, start, view } from './playthrough'
import { conversationSchema, type Conversation } from '../project/schemas/conversation'
import type { Variable } from '../project/schemas/variables'

const vars: Variable[] = [
  { id: 'f', name: 'met', type: 'flag', default: false },
  { id: 'n', name: 'gold', type: 'number', default: 10 },
]

let counter = 0
const line = (text: string, attrs: Record<string, unknown> = {}) => ({
  type: 'line',
  attrs: { id: `b${++counter}`, lineId: `L${String(counter).padStart(6, '0')}`, ...attrs },
  content: text ? [{ type: 'text', text }] : [],
})
const lines = (id: string, next: string | null, ls = [line('hi')], extra = {}) => ({
  id,
  type: 'lines',
  x: 0,
  y: 0,
  sets: [],
  next,
  content: { type: 'doc', content: ls },
  ...extra,
})
const choice = (id: string, options: unknown[], extra = {}) => ({
  id,
  type: 'choice',
  x: 0,
  y: 0,
  sets: [],
  options,
  ...extra,
})
const opt = (id: string, target: string | null, extra = {}) => ({
  id,
  text: `text ${id}`,
  target,
  sets: [],
  ...extra,
})
const jump = (id: string, to: string | null, extra = {}) => ({
  id,
  type: 'jump',
  x: 0,
  y: 0,
  sets: [],
  target: to === null ? null : { nodeId: to },
  ...extra,
})
const end = (id: string, extra = {}) => ({ id, type: 'end', x: 0, y: 0, sets: [], ...extra })

const conv = (startNodeId: string | null, nodes: unknown[]): Conversation =>
  conversationSchema.parse({ version: 2, id: 'c', title: 'C', startNodeId, nodes })
const all = (...terms: unknown[]) => ({ mode: 'all', terms })
const any = (...terms: unknown[]) => ({ mode: 'any', terms })
const metIsTrue = { variableId: 'f', op: 'isTrue' }
const goldAtLeast = (value: number) => ({ variableId: 'n', op: 'gte', value })

describe('playthrough', () => {
  it('walks lines to the end', () => {
    let s = start(conv('a', [lines('a', 'z'), end('z')]), vars)
    expect(view(s)).toMatchObject({ kind: 'lines', nodeId: 'a', canContinue: true })
    s = advance(s)
    expect(view(s)).toEqual({ kind: 'end' })
    expect(s.status).toBe('ended')
    expect(s.steps).toBe(2)
  })

  it('extracts speaker, kind and text', () => {
    const ls = [
      line('Hello ', { speakerId: 'e1', kind: 'speech' }),
      line('', { speakerName: 'Guard' }),
      line('It rains.', { kind: 'text' }),
    ]
    ls[0].content.push({ type: 'text', text: 'there' })
    const v = view(start(conv('a', [lines('a', null, ls)]), vars))
    if (v.kind !== 'lines') throw new Error('expected lines')
    expect(v.lines).toEqual([
      { lineId: ls[0].attrs.lineId, speakerId: 'e1', kind: 'speech', text: 'Hello there' },
      { lineId: ls[1].attrs.lineId, speakerName: 'Guard', kind: 'speech', text: '' },
      { lineId: ls[2].attrs.lineId, kind: 'text', text: 'It rains.' },
    ])
  })

  it('records shown lines in the log', () => {
    const s = advance(start(conv('a', [lines('a', 'b'), lines('b', null)]), vars))
    expect(s.log.map((e) => e.nodeId)).toEqual(['a', 'b'])
  })

  it('hides an option whose condition is false', () => {
    const c = conv('c', [
      choice('c', [opt('o1', 'e', { condition: all(metIsTrue) }), opt('o2', 'e')]),
      end('e'),
    ])
    const v = view(start(c, vars))
    expect(v).toMatchObject({ kind: 'choice', options: [{ id: 'o2', text: 'text o2' }] })
  })

  it('shows an option whose condition holds, and picking it applies its sets', () => {
    const c = conv('c', [
      choice('c', [
        opt('o1', 'e', {
          condition: all(goldAtLeast(10)),
          sets: [{ variableId: 'n', op: 'add', value: -4 }],
        }),
      ]),
      end('e'),
    ])
    const s0 = start(c, vars)
    expect(view(s0)).toMatchObject({ options: [{ id: 'o1' }] })
    const s1 = choose(s0, 'o1')
    expect(s1.values.n).toBe(6)
    expect(view(s1)).toEqual({ kind: 'end' })
  })

  it('applies node sets on entry', () => {
    const c = conv('a', [
      lines('a', 'e', [line('x')], { sets: [{ variableId: 'f', op: 'toggle' }] }),
      end('e'),
    ])
    expect(start(c, vars).values.f).toBe(true)
  })

  it('stops with node-blocked when the entry condition is false', () => {
    const cond = all(metIsTrue)
    const s = start(conv('a', [lines('a', null, [line('x')], { condition: cond })]), vars)
    expect(view(s)).toEqual({
      kind: 'stopped',
      reason: { kind: 'node-blocked', nodeId: 'a', failedCondition: cond },
    })
  })

  it('stops naming a variable that is undefined in an option condition', () => {
    const bad = { variableId: 'gone', op: 'isTrue' }
    const c = conv('c', [choice('c', [opt('o1', 'e', { condition: all(bad) })]), end('e')])
    expect(view(start(c, vars))).toEqual({
      kind: 'stopped',
      reason: { kind: 'undefined-variable', variableId: 'gone', nodeId: 'c' },
    })
  })

  it('stops on an undefined variable in a set', () => {
    const c = conv('a', [
      lines('a', null, [line('x')], { sets: [{ variableId: 'gone', op: 'set', value: 1 }] }),
    ])
    expect(view(start(c, vars))).toEqual({
      kind: 'stopped',
      reason: { kind: 'undefined-variable', variableId: 'gone', nodeId: 'a' },
    })
  })

  it('stops on a type mismatch in a condition', () => {
    const c = conv('a', [
      lines('a', null, [line('x')], { condition: all({ variableId: 'f', op: 'gt', value: 1 }) }),
    ])
    expect(view(start(c, vars))).toEqual({
      kind: 'stopped',
      reason: { kind: 'type-mismatch', variableId: 'f', nodeId: 'a' },
    })
  })

  it('stops on a type mismatch in an option set, naming the node', () => {
    const c = conv('c', [
      choice('c', [opt('o1', 'e', { sets: [{ variableId: 'n', op: 'toggle' }] })]),
      end('e'),
    ])
    const s = choose(start(c, vars), 'o1')
    expect(view(s)).toEqual({
      kind: 'stopped',
      reason: { kind: 'type-mismatch', variableId: 'n', nodeId: 'c' },
    })
  })

  it('counts visits across a loop', () => {
    const c = conv('a', [
      lines('a', 'c'),
      choice('c', [opt('again', 'a'), opt('out', 'e')]),
      end('e'),
    ])
    let s = advance(start(c, vars))
    expect(s.loop).toBe(false)
    s = advance(choose(s, 'again'))
    expect(s.visits).toEqual({ a: 2, c: 2 })
    expect(s.loop).toBe(true)
  })

  it('flags loop on the node entered the second time', () => {
    const c = conv('a', [lines('a', 'c'), choice('c', [opt('again', 'a')])])
    const s = choose(advance(start(c, vars)), 'again')
    expect(view(s)).toMatchObject({ kind: 'lines', nodeId: 'a', loop: true })
  })

  it('stops at the step limit on a self-loop jump', () => {
    const s = start(conv('j', [jump('j', 'j')]), vars)
    expect(view(s)).toEqual({ kind: 'stopped', reason: { kind: 'step-limit' } })
    expect(s.steps).toBe(MAX_STEPS)
  })

  it('follows a jump chain without a screen', () => {
    const c = conv('j1', [jump('j1', 'j2'), jump('j2', 'a'), lines('a', null)])
    const s = start(c, vars)
    expect(view(s)).toMatchObject({ kind: 'lines', nodeId: 'a' })
    expect(s.visits).toEqual({ j1: 1, j2: 1, a: 1 })
  })

  it('applies a jump node entry condition and sets', () => {
    const c = conv('j', [
      jump('j', 'a', { sets: [{ variableId: 'n', op: 'set', value: 3 }] }),
      lines('a', null),
    ])
    expect(start(c, vars).values.n).toBe(3)
    const blocked = conv('j', [jump('j', 'a', { condition: all(metIsTrue) }), lines('a', null)])
    expect(view(start(blocked, vars))).toMatchObject({
      reason: { kind: 'node-blocked', nodeId: 'j' },
    })
  })

  it('stops when a target is null', () => {
    const s = advance(start(conv('a', [lines('a', null)]), vars))
    expect(view(s)).toEqual({ kind: 'stopped', reason: { kind: 'missing-target', nodeId: 'a' } })
    const j = start(conv('j', [jump('j', null)]), vars)
    expect(view(j)).toEqual({ kind: 'stopped', reason: { kind: 'missing-target', nodeId: 'j' } })
  })

  it('stops when a target points to a missing node, naming the option', () => {
    const s = choose(start(conv('c', [choice('c', [opt('o1', 'nope')])]), vars), 'o1')
    expect(view(s)).toEqual({
      kind: 'stopped',
      reason: { kind: 'missing-target', nodeId: 'c', optionId: 'o1' },
    })
    const l = advance(start(conv('a', [lines('a', 'nope')]), vars))
    expect(view(l)).toMatchObject({ reason: { kind: 'missing-target', nodeId: 'a' } })
  })

  it('stops without a start node', () => {
    expect(view(start(conv(null, [lines('a', null)]), vars))).toEqual({
      kind: 'stopped',
      reason: { kind: 'no-start' },
    })
    expect(view(start(conv('gone', [lines('a', null)]), vars))).toEqual({
      kind: 'stopped',
      reason: { kind: 'no-start' },
    })
  })

  it('stops on an empty conversation', () => {
    expect(view(start(conv(null, []), vars))).toEqual({
      kind: 'stopped',
      reason: { kind: 'empty-conversation' },
    })
  })

  it('stops when no option is visible', () => {
    const c = conv('c', [choice('c', [opt('o1', 'e', { condition: all(metIsTrue) })]), end('e')])
    expect(view(start(c, vars))).toEqual({
      kind: 'stopped',
      reason: { kind: 'no-visible-options', nodeId: 'c' },
    })
  })

  it('reset restores the start and default values', () => {
    const c = conv('c', [
      choice('c', [opt('o1', 'e', { sets: [{ variableId: 'n', op: 'set', value: 99 }] })]),
      end('e'),
    ])
    const s = reset(choose(start(c, vars), 'o1'))
    expect(s.values.n).toBe(10)
    expect(s.steps).toBe(1)
    expect(s.log).toEqual([])
    expect(view(s)).toMatchObject({ kind: 'choice', nodeId: 'c' })
  })

  it('leaves the old state unchanged after choose', () => {
    const c = conv('c', [
      choice('c', [opt('o1', 'e', { sets: [{ variableId: 'n', op: 'add', value: 1 }] })]),
      end('e'),
    ])
    const s0 = start(c, vars)
    const before = JSON.stringify(s0)
    choose(s0, 'o1')
    expect(JSON.stringify(s0)).toBe(before)
    expect(s0.values.n).toBe(10)
  })

  it('returns the same state for invalid operations', () => {
    const c = conv('a', [lines('a', 'c'), choice('c', [opt('o1', 'e')]), end('e')])
    const s0 = start(c, vars)
    expect(choose(s0, 'o1')).toBe(s0)
    const s1 = advance(s0)
    expect(advance(s1)).toBe(s1)
    expect(choose(s1, 'unknown')).toBe(s1)
    const done = choose(s1, 'o1')
    expect(advance(done)).toBe(done)
    expect(choose(done, 'o1')).toBe(done)
  })

  it('does not accept a hidden option', () => {
    const c = conv('c', [
      choice('c', [opt('o1', 'e', { condition: all(metIsTrue) }), opt('o2', 'e')]),
      end('e'),
    ])
    const s = start(c, vars)
    expect(choose(s, 'o1')).toBe(s)
  })

  it('handles ANY and ALL conditions on options', () => {
    const c = conv('c', [
      choice('c', [
        opt('any', 'e', { condition: any(metIsTrue, goldAtLeast(10)) }),
        opt('all', 'e', { condition: all(metIsTrue, goldAtLeast(10)) }),
      ]),
      end('e'),
    ])
    const v = view(start(c, vars))
    if (v.kind !== 'choice') throw new Error('expected choice')
    expect(v.options.map((o) => o.id)).toEqual(['any'])
  })
})
