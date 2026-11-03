import { describe, expect, it } from 'vitest'
import { buildLinkContext } from './linkContext'
import { buildLinkNames, linkCandidates, linkLabel, type LinkNames } from './linkLabels'

const names: LinkNames = buildLinkNames({
  variables: [{ id: 'v1', name: 'has_key' }],
  items: [{ id: 'c1', title: 'Gate talk' }, { id: 's1', title: '' }],
  beats: [{ id: 'b1', text: 'x'.repeat(100) }],
  entries: [{ id: 'e1', name: 'Mira' }],
  mechanics: [{ id: 'm1', title: 'Stealth' }, { id: 'm2', title: 'Crafting' }],
  trash: [
    { id: 'e2', title: 'Old hero', type: 'entry' },
    { id: 'm3', title: 'Cut idea', type: 'mechanic' },
    { id: 'r1', title: 'A rule', type: 'rule' },
  ],
})
const fb = { missing: 'Deleted', untitled: 'Untitled' }

describe('linkLabel', () => {
  it('shows the current name of the target', () => {
    expect(linkLabel({ kind: 'variable', id: 'v1' }, names, fb)).toBe('has_key')
    expect(linkLabel({ kind: 'mechanic', id: 'm1' }, names, fb)).toBe('Stealth')
  })
  it('keeps the name of trashed targets', () => {
    expect(linkLabel({ kind: 'entry', id: 'e2' }, names, fb)).toBe('Old hero')
    expect(linkLabel({ kind: 'mechanic', id: 'm3' }, names, fb)).toBe('Cut idea')
  })
  it('uses the fallback for a deleted target and for an empty name', () => {
    expect(linkLabel({ kind: 'variable', id: 'gone' }, names, fb)).toBe('Deleted')
    expect(linkLabel({ kind: 'item', id: 's1' }, names, fb)).toBe('Untitled')
  })
  it('shortens long beat text', () => {
    const l = linkLabel({ kind: 'beat', id: 'b1' }, names, fb)
    expect(l.length).toBeLessThan(70)
    expect(l.endsWith('…')).toBe(true)
  })
})

describe('linkCandidates', () => {
  const ctx = buildLinkContext({
    variableIds: ['v1'], tree: [], trash: [], beatIds: ['b1'], entryIds: ['e1'], mechanicIds: ['m1', 'm2'],
  })
  it('lists live targets not yet linked', () => {
    const out = linkCandidates('mechanic', { names, ctx, linked: [{ kind: 'mechanic', id: 'm2' }], selfId: 'm0', query: '' })
    expect(out.map((c) => c.id)).toEqual(['m1'])
  })
  it('leaves out the mechanic itself', () => {
    const out = linkCandidates('mechanic', { names, ctx, linked: [], selfId: 'm1', query: '' })
    expect(out.map((c) => c.id)).toEqual(['m2'])
  })
  it('filters by name, ignoring case', () => {
    const out = linkCandidates('mechanic', { names, ctx, linked: [], selfId: 'm0', query: 'CRAFT' })
    expect(out.map((c) => c.id)).toEqual(['m2'])
  })
  it('skips targets that are not live', () => {
    expect(linkCandidates('entry', { names, ctx, linked: [], selfId: 'm1', query: '' }).map((c) => c.id)).toEqual(['e1'])
  })
})
