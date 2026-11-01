// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BlockIds } from './blockIds'
import { EventLinks, summarizeBlockLinks, type BlockLinkInfo } from './eventLinks'
import { CODEX_KIND, EVENT_KIND, type Link } from '../project/links'

const link = (id: string, kind: string, block: string | undefined): Link => ({
  id,
  kind,
  from: { item: 's', ...(block ? { block } : {}) },
  to: kind === CODEX_KIND ? { item: 'e1' } : { item: 't', block: 'n' },
})

describe('summarizeBlockLinks', () => {
  it('combines event and entry counts per block and keeps both kinds', () => {
    const m = summarizeBlockLinks(
      [link('1', EVENT_KIND, 'a'), link('2', CODEX_KIND, 'a'), link('3', CODEX_KIND, 'a'), link('4', CODEX_KIND, 'b')],
      () => false,
    )
    expect(m.get('a')).toEqual({ count: 3, broken: false, events: 1, entries: 2 })
    expect(m.get('b')).toEqual({ count: 1, broken: false, events: 0, entries: 1 })
  })

  it('a block is broken when any one of its links is, whatever the kind', () => {
    const links = [link('1', EVENT_KIND, 'a'), link('2', CODEX_KIND, 'a'), link('3', CODEX_KIND, 'b')]
    const m = summarizeBlockLinks(links, (l) => l.id === '2')
    expect(m.get('a')!.broken).toBe(true)
    expect(m.get('b')!.broken).toBe(false)
  })

  it('links without a passage block are skipped', () => {
    expect(summarizeBlockLinks([link('1', CODEX_KIND, undefined)], () => false).size).toBe(0)
  })
})

describe('markers for codex links', () => {
  const editors: Editor[] = []
  afterEach(() => {
    while (editors.length) editors.pop()!.destroy()
  })
  const make = (info: (id: string) => BlockLinkInfo | null) => {
    const content: JSONContent[] = [
      { type: 'paragraph', attrs: { id: 'a' }, content: [{ type: 'text', text: 'x' }] },
    ]
    const e = new Editor({
      extensions: [StarterKit.configure({ trailingNode: false }), BlockIds, EventLinks.configure({ info })],
      content: { type: 'doc', content },
    })
    editors.push(e)
    return e.view.dom.querySelector('p')!
  }

  it('entry-only blocks get the codex class, not the event one', () => {
    const p = make(() => ({ count: 1, broken: false, events: 0, entries: 1 }))
    expect(p.classList.contains('has-codex-link')).toBe(true)
    expect(p.classList.contains('has-event-link')).toBe(false)
  })

  it('mixed blocks get both; plain info keeps the old event class', () => {
    const mixed = make(() => ({ count: 2, broken: false, events: 1, entries: 1 }))
    expect(mixed.classList.contains('has-event-link') && mixed.classList.contains('has-codex-link')).toBe(true)
    const old = make(() => ({ count: 1, broken: true }))
    expect(old.classList.contains('has-event-link')).toBe(true)
    expect(old.classList.contains('has-codex-link')).toBe(false)
    expect(old.classList.contains('has-broken-link')).toBe(true)
  })
})
