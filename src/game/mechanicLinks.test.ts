import { describe, expect, it } from 'vitest'
import { mechanicSchema, type Mechanic, type MechanicLink } from '../project/schemas/mechanic'
import {
  addLink,
  brokenLinks,
  mechanicsFor,
  relatedMechanics,
  removeLink,
  resolveLink,
  type LinkContext,
} from './mechanicLinks'

const mech = (id: string, links: MechanicLink[] = []): Mechanic =>
  mechanicSchema.parse({ version: 1, id, title: id, categoryId: 'c', links })
const set = (...ids: string[]) => new Set(ids)
const ctx = (over: Partial<LinkContext> = {}): LinkContext => ({
  variable: { live: set('v1'), trashed: set() },
  item: { live: set('i1'), trashed: set('i2') },
  beat: { live: set('b1'), trashed: set() },
  entry: { live: set('e1'), trashed: set('e2') },
  mechanic: { live: set('m1', 'm2'), trashed: set('m3') },
  ...over,
})

describe('resolveLink', () => {
  it.each([
    ['variable', 'v1'], ['item', 'i1'], ['beat', 'b1'], ['entry', 'e1'], ['mechanic', 'm1'],
  ] as const)('a live %s resolves', (kind, id) => {
    expect(resolveLink({ kind, id }, ctx())).toEqual({ ok: true })
  })

  it('a trashed item, entry or mechanic is reported as trashed (restore repairs it)', () => {
    expect(resolveLink({ kind: 'item', id: 'i2' }, ctx())).toEqual({ ok: false, reason: 'trashed' })
    expect(resolveLink({ kind: 'entry', id: 'e2' }, ctx())).toEqual({ ok: false, reason: 'trashed' })
    expect(resolveLink({ kind: 'mechanic', id: 'm3' }, ctx())).toEqual({ ok: false, reason: 'trashed' })
  })

  it('a deleted variable or beat is missing', () => {
    expect(resolveLink({ kind: 'variable', id: 'gone' }, ctx())).toEqual({ ok: false, reason: 'missing' })
    expect(resolveLink({ kind: 'beat', id: 'gone' }, ctx())).toEqual({ ok: false, reason: 'missing' })
  })

  it('the same id under another kind does not resolve', () => {
    expect(resolveLink({ kind: 'entry', id: 'i1' }, ctx())).toEqual({ ok: false, reason: 'missing' })
  })
})

describe('brokenLinks', () => {
  it('lists only broken links, in order', () => {
    const m = mech('m1', [
      { kind: 'variable', id: 'v1' },
      { kind: 'item', id: 'i2' },
      { kind: 'variable', id: 'gone' },
    ])
    expect(brokenLinks(m, ctx()).map((b) => [b.link.id, b.reason])).toEqual([
      ['i2', 'trashed'],
      ['gone', 'missing'],
    ])
  })
  it('none for a good mechanic; restoring the target clears the finding', () => {
    const m = mech('m1', [{ kind: 'item', id: 'i2' }])
    expect(brokenLinks(m, ctx())).toHaveLength(1)
    const restored = ctx({ item: { live: set('i1', 'i2'), trashed: set() } })
    expect(brokenLinks(m, restored)).toEqual([])
  })
})

describe('reverse links', () => {
  const all = [
    mech('m1', [{ kind: 'variable', id: 'v1' }, { kind: 'mechanic', id: 'm2' }]),
    mech('m2', [{ kind: 'variable', id: 'v1' }]),
    mech('m4', [{ kind: 'item', id: 'i1' }, { kind: 'mechanic', id: 'm4' }]),
  ]
  it('mechanicsFor lists the mechanics that link to a target, in order', () => {
    expect(mechanicsFor('variable', 'v1', all).map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(mechanicsFor('item', 'i1', all).map((m) => m.id)).toEqual(['m4'])
    expect(mechanicsFor('entry', 'e1', all)).toEqual([])
  })
  it('a mechanic linking to itself does not count as its own reverse link', () => {
    expect(mechanicsFor('mechanic', 'm4', all)).toEqual([])
  })
  it('relatedMechanics joins outgoing and incoming links without duplicates or itself', () => {
    expect(relatedMechanics(all[0], all).map((m) => m.id)).toEqual(['m2'])
    expect(relatedMechanics(all[1], all).map((m) => m.id)).toEqual(['m1'])
    expect(relatedMechanics(all[2], all)).toEqual([])
  })
})

describe('addLink / removeLink', () => {
  const m = mech('m1', [{ kind: 'item', id: 'i1' }])
  it('adds a link once', () => {
    const a = addLink(m, { kind: 'entry', id: 'e1' })
    expect(a.links).toHaveLength(2)
    expect(addLink(a, { kind: 'entry', id: 'e1' })).toBe(a)
  })
  it('refuses a link to itself', () => {
    expect(addLink(m, { kind: 'mechanic', id: 'm1' })).toBe(m)
  })
  it('removes a link by kind and id; unknown link changes nothing', () => {
    expect(removeLink(m, { kind: 'item', id: 'i1' }).links).toEqual([])
    expect(removeLink(m, { kind: 'entry', id: 'i1' })).toBe(m)
  })
})
