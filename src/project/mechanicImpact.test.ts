import { describe, expect, it } from 'vitest'
import type { Mechanic } from './schemas/mechanic'
import { mechanicLinkCount } from './mechanicImpact'

const m = (id: string, links: Mechanic['links']): Mechanic =>
  ({ version: 1, id, title: id, summary: '', categoryId: 'c', status: 'idea', tags: [], description: {}, parameters: [], links })

describe('mechanicLinkCount', () => {
  const all = [
    m('a', [{ kind: 'variable', id: 'v1' }, { kind: 'entry', id: 'e1' }]),
    m('b', [{ kind: 'variable', id: 'v1' }]),
    m('c', []),
  ]
  it('counts mechanics linking to the target', () => {
    expect(mechanicLinkCount('variable', 'v1', all)).toBe(2)
    expect(mechanicLinkCount('entry', 'e1', all)).toBe(1)
  })
  it('is zero when nothing links to it', () => {
    expect(mechanicLinkCount('beat', 'b1', all)).toBe(0)
  })
})
