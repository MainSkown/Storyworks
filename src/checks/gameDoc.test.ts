import { describe, expect, it } from 'vitest'
import { mechanicBrokenLinks, mechanicsNoLinks, variablesUnused, type GameDocInput } from './gameDoc'
import type { LinkContext } from '../game/mechanicLinks'
import { conversationSchema, type Conversation } from '../project/schemas/conversation'
import type { Mechanic } from '../project/schemas/mechanic'

const mech = (id: string, over: Partial<Mechanic> = {}): Mechanic => ({
  version: 1,
  id,
  title: `Mech ${id}`,
  summary: '',
  categoryId: 'c',
  status: 'implemented',
  tags: [],
  description: { type: 'doc', content: [] },
  parameters: [],
  links: [],
  ...over,
})

const set = (...ids: string[]) => new Set(ids)
const ctx = (over: Partial<LinkContext> = {}): LinkContext => ({
  variable: { live: set('gold'), trashed: set() },
  item: { live: set('i1'), trashed: set('i2') },
  beat: { live: set(), trashed: set() },
  entry: { live: set(), trashed: set() },
  mechanic: { live: set('m1'), trashed: set() },
  ...over,
})

const conv = (nodes: unknown[]): Conversation =>
  conversationSchema.parse({ version: 3, id: 'c1', title: 'c1', startNodeId: null, nodes })
const withSet = (variableId: string) =>
  conv([{ x: 0, y: 0, id: 'n1', type: 'end', sets: [{ variableId, op: 'set', value: true }] }])
const withTerm = (variableId: string) =>
  conv([
    {
      x: 0,
      y: 0,
      id: 'n1',
      type: 'end',
      condition: { mode: 'all', terms: [{ variableId, op: 'gt', value: 1 }] },
    },
  ])

const vars = [{ id: 'gold', name: 'Gold' }]
const input = (over: Partial<GameDocInput> = {}): GameDocInput => ({
  mechanics: [],
  linkContext: ctx(),
  variables: vars,
  conversations: [],
  ...over,
})

describe('mechanicBrokenLinks', () => {
  it('reports a missing and a trashed target, one finding each', () => {
    const m = mech('m1', {
      links: [
        { kind: 'item', id: 'gone' },
        { kind: 'item', id: 'i2' },
        { kind: 'item', id: 'i1' },
      ],
    })
    const f = mechanicBrokenLinks(input({ mechanics: [m] }))
    expect(f.map((x) => x.id)).toEqual([
      'mechanic-broken-link:m1:item:gone',
      'mechanic-broken-link:m1:item:i2',
    ])
    expect(f[0]!.severity).toBe('error')
    expect(f[0]!.params).toEqual({ mechanic: 'Mech m1' })
    expect(f[0]!.locations).toEqual([{ kind: 'mechanic', id: 'm1', label: 'Mech m1' }])
  })
  it('reports nothing when every link resolves', () => {
    const m = mech('m2', { links: [{ kind: 'item', id: 'i1' }, { kind: 'mechanic', id: 'm1' }] })
    expect(mechanicBrokenLinks(input({ mechanics: [m] }))).toEqual([])
  })
  it('gives the same ids on every run', () => {
    const m = mech('m1', { links: [{ kind: 'entry', id: 'x' }] })
    const a = mechanicBrokenLinks(input({ mechanics: [m] }))
    expect(mechanicBrokenLinks(input({ mechanics: [m] })).map((f) => f.id)).toEqual(a.map((f) => f.id))
  })
})

describe('mechanicsNoLinks', () => {
  it('flags an implemented mechanic without links', () => {
    const f = mechanicsNoLinks(input({ mechanics: [mech('m1')] }))
    expect(f).toHaveLength(1)
    expect(f[0]!.id).toBe('mechanic-no-links:m1')
    expect(f[0]!.severity).toBe('info')
    expect(f[0]!.params).toEqual({ mechanic: 'Mech m1' })
    expect(f[0]!.locations).toEqual([{ kind: 'mechanic', id: 'm1', label: 'Mech m1' }])
  })
  it('skips idea, designed and cut mechanics', () => {
    const ms = (['idea', 'designed', 'cut'] as const).map((s, i) => mech(`m${i}`, { status: s }))
    expect(mechanicsNoLinks(input({ mechanics: ms }))).toEqual([])
  })
  it('skips an implemented mechanic that has a link', () => {
    const m = mech('m1', { links: [{ kind: 'item', id: 'i1' }] })
    expect(mechanicsNoLinks(input({ mechanics: [m] }))).toEqual([])
  })
})

describe('variablesUnused', () => {
  it('flags a variable nothing uses', () => {
    const f = variablesUnused(input())
    expect(f).toHaveLength(1)
    expect(f[0]!.id).toBe('variable-unused:gold')
    expect(f[0]!.severity).toBe('info')
    expect(f[0]!.params).toEqual({ variable: 'Gold' })
    expect(f[0]!.locations).toEqual([{ kind: 'variable', id: 'gold', label: 'Gold' }])
  })
  it('counts a condition, a set, or a mechanic link as use', () => {
    expect(variablesUnused(input({ conversations: [withTerm('gold')] }))).toEqual([])
    expect(variablesUnused(input({ conversations: [withSet('gold')] }))).toEqual([])
    const m = mech('m1', { links: [{ kind: 'variable', id: 'gold' }] })
    expect(variablesUnused(input({ mechanics: [m] }))).toEqual([])
  })
  it('ignores uses of other variables', () => {
    expect(variablesUnused(input({ conversations: [withSet('other')] }))).toHaveLength(1)
  })
})
