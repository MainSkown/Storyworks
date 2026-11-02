import { describe, expect, it } from 'vitest'
import type { ChangeItem } from './items'
import { itemGroup, itemLabel } from './itemLabel'

const t = (key: string) =>
  ({
    'history.kind.added': 'added',
    'history.kind.modified': 'edited',
    'history.kind.deleted': 'deleted',
    'history.kind.moved': 'moved',
    'history.kind.renamed': 'renamed',
    'history.type.rule': 'Rule',
    'history.type.settings': 'Book settings',
    'history.type.calendar': 'Calendar',
    'history.type.asset': 'File',
  })[key] ?? key

const item = (over: Partial<ChangeItem>): ChangeItem => ({
  key: 'k', type: 'scene', title: 'Scene 2', kinds: ['modified'], context: [], paths: [], ...over,
})

describe('itemLabel', () => {
  it('names a scene by its chapter and title', () => {
    expect(itemLabel(item({ context: ['Chapter 3'] }), t)).toBe('Chapter 3 – Scene 2: edited')
  })
  it('joins several kinds', () => {
    expect(itemLabel(item({ kinds: ['renamed', 'moved'] }), t)).toBe('Scene 2: renamed, moved')
  })
  it('prefixes non-manuscript items with their type', () => {
    expect(itemLabel(item({ type: 'rule', title: 'No magic', kinds: ['added'] }), t)).toBe('Rule: No magic: added')
  })
  it('uses the type alone when there is no title', () => {
    expect(itemLabel(item({ type: 'settings', title: '', kinds: ['modified'] }), t)).toBe('Book settings: edited')
    expect(itemLabel(item({ type: 'calendar', title: 'calendar.json', kinds: ['modified'] }), t)).toBe('Calendar: edited')
  })
})

describe('itemGroup', () => {
  it('groups by area', () => {
    expect(itemGroup('scene')).toBe('manuscript')
    expect(itemGroup('timeline')).toBe('timelines')
    expect(itemGroup('rule')).toBe('rules')
    expect(itemGroup('entry')).toBe('codex')
    expect(itemGroup('settings')).toBe('other')
    expect(itemGroup('asset')).toBe('other')
  })
})
