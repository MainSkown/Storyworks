import { describe, expect, it } from 'vitest'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { TrashEntry } from '../project/types'
import { buildLinkContext } from './linkContext'

const node = (id: string, type: ManuscriptNode['type'], children: ManuscriptNode[] = []): ManuscriptNode => ({
  id, type, title: id, children,
})
const trashed = (id: string, type: TrashEntry['type']): TrashEntry => ({
  id, type, title: id, originalPath: '', trashPath: '', parentId: null, index: 0, deletedAt: '',
})

describe('buildLinkContext', () => {
  const ctx = buildLinkContext({
    variableIds: ['v1'],
    tree: [node('f', 'chapter', [node('s1', 'scene'), node('c1', 'conversation')])],
    trash: [trashed('s2', 'scene'), trashed('c2', 'conversation'), trashed('e2', 'entry'), trashed('m3', 'mechanic'), trashed('r1', 'rule')],
    beatIds: ['b1'],
    entryIds: ['e1'],
    mechanicIds: ['m1'],
  })

  it('items are live scripts and conversations at any depth, not folders', () => {
    expect([...ctx.item.live].sort()).toEqual(['c1', 's1'])
  })
  it('trashed items, entries and mechanics are separated by type', () => {
    expect([...ctx.item.trashed].sort()).toEqual(['c2', 's2'])
    expect([...ctx.entry.trashed]).toEqual(['e2'])
    expect([...ctx.mechanic.trashed]).toEqual(['m3'])
  })
  it('variables and beats have no trash', () => {
    expect([...ctx.variable.live]).toEqual(['v1'])
    expect(ctx.variable.trashed.size).toBe(0)
    expect([...ctx.beat.live]).toEqual(['b1'])
    expect(ctx.beat.trashed.size).toBe(0)
  })
})
