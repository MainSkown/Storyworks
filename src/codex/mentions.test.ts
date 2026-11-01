import { describe, expect, it } from 'vitest'
import { blockTexts, findMentions, mentionId, type MentionScene } from './mentions'
import { CODEX_KIND, type Link } from '../project/links'

const p = (id: string, text: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: text === '' ? [] : [{ type: 'text', text }],
})
const scene = (id: string, ...blocks: unknown[]): MentionScene => ({
  id,
  content: { type: 'doc', content: blocks },
})
const entry = (name: string, aliases: string[] = [], id = 'e1') => ({ id, name, aliases })
const link = (sceneId: string, block: string, entryId = 'e1'): Link => ({
  id: `l-${sceneId}-${block}-${entryId}`,
  kind: CODEX_KIND,
  from: { item: sceneId, block },
  to: { item: entryId },
})
const find = (
  e: ReturnType<typeof entry>,
  scenes: MentionScene[],
  links: Link[] = [],
  ignored: string[] = [],
) => findMentions(e, scenes, links, new Set(ignored))

describe('findMentions: matching', () => {
  it('finds the name and aliases', () => {
    const s = scene('s1', p('b1', 'Anna waited.'), p('b2', 'The captain left.'))
    const r = find(entry('Anna', ['the captain']), [s])
    expect(r.map((m) => m.blockId)).toEqual(['b1', 'b2'])
    expect(r[1].ranges).toEqual([{ start: 0, end: 11 }])
  })

  it('matches whole words only', () => {
    const s = scene('s1', p('b1', 'Anna and Annabel met Joanna.'))
    const r = find(entry('Ann'), [s])
    expect(r).toEqual([])
    expect(find(entry('Anna'), [s])[0].ranges).toEqual([{ start: 0, end: 4 }])
  })

  it('is case-insensitive', () => {
    const r = find(entry('anna'), [scene('s1', p('b1', 'ANNA shouted'))])
    expect(r).toHaveLength(1)
  })

  it('handles Polish letters as word characters', () => {
    const s = scene('s1', p('b1', 'Łukasz poszedł. Zażółć gęślą jaźń. Mały Łukaszek.'))
    expect(find(entry('Łukasz'), [s])[0].ranges).toEqual([{ start: 0, end: 6 }])
    expect(find(entry('łukasz'), [s])[0].ranges).toHaveLength(1)
    expect(find(entry('jaź'), [s])).toEqual([])
    expect(find(entry('jaźń'), [s])).toHaveLength(1)
    expect(find(entry('Gęślą'), [s])).toHaveLength(1)
  })

  it('does not match inside a word that continues with a Polish letter', () => {
    expect(find(entry('Zaż'), [scene('s1', p('b1', 'Zażółć'))])).toEqual([])
  })

  it('digits count as word characters', () => {
    expect(find(entry('Room 1'), [scene('s1', p('b1', 'Room 12'))])).toEqual([])
    expect(find(entry('Room 1'), [scene('s1', p('b1', 'Room 1.'))])).toHaveLength(1)
  })

  it('punctuation around the name is fine', () => {
    const r = find(entry('Anna'), [scene('s1', p('b1', '"Anna," she said; (Anna) -Anna-'))])
    expect(r[0].ranges).toHaveLength(3)
  })

  it('multiple hits in one block make one mention with all ranges', () => {
    const r = find(entry('Anna', ['Ania']), [scene('s1', p('b1', 'Anna met Ania. Anna left.'))])
    expect(r).toHaveLength(1)
    expect(r[0].ranges).toEqual([
      { start: 0, end: 4 },
      { start: 9, end: 13 },
      { start: 15, end: 19 },
    ])
  })

  it('prefers the longer name where names overlap', () => {
    const r = find(entry('Anna Kowalska', ['Anna']), [scene('s1', p('b1', 'Anna Kowalska came.'))])
    expect(r[0].ranges).toEqual([{ start: 0, end: 13 }])
  })

  it('escapes regex characters in names', () => {
    const s = scene('s1', p('b1', 'He had a C++ book (vol. 2) and a.b [x] $5 ^ \\ | ?'))
    expect(find(entry('a.b'), [s])).toHaveLength(1)
    expect(find(entry('axb'), [scene('s1', p('b1', 'a.b'))])).toEqual([])
    expect(find(entry('(vol. 2)'), [s])).toHaveLength(1)
    expect(find(entry('[x]'), [s])).toHaveLength(1)
    expect(find(entry('$5 ^ \\ | ?'), [s])).toHaveLength(1)
    expect(() => find(entry('*'), [s])).not.toThrow()
  })

  it('skips empty and blank names and aliases', () => {
    const s = scene('s1', p('b1', 'Some text here'))
    expect(find(entry(''), [s])).toEqual([])
    expect(find(entry('  ', ['', ' ']), [s])).toEqual([])
    expect(find(entry('', ['text']), [s])).toHaveLength(1)
  })

  it('trims names and ignores duplicate aliases', () => {
    const r = find(entry(' Anna ', ['Anna', 'anna']), [scene('s1', p('b1', 'Anna'))])
    expect(r[0].ranges).toEqual([{ start: 0, end: 4 }])
  })

  it('finds nothing in empty blocks or scenes', () => {
    expect(find(entry('Anna'), [scene('s1', p('b1', '')), scene('s2')])).toEqual([])
  })
})

describe('findMentions: skipping', () => {
  const s = scene('s1', p('b1', 'Anna here'), p('b2', 'Anna there'))

  it('skips a block already linked to that entry', () => {
    const r = find(entry('Anna'), [s], [link('s1', 'b1')])
    expect(r.map((m) => m.blockId)).toEqual(['b2'])
  })

  it('a link to another entry or an event link does not hide the mention', () => {
    const ev: Link = {
      id: 'x',
      kind: 'event',
      from: { item: 's1', block: 'b1' },
      to: { item: 'e1', block: 'n' },
    }
    const r = find(entry('Anna'), [s], [link('s1', 'b1', 'e2'), ev])
    expect(r).toHaveLength(2)
  })

  it('a link in a different scene does not hide the block', () => {
    expect(find(entry('Anna'), [s], [link('s9', 'b1')])).toHaveLength(2)
  })

  it('skips every block that is linked, so nothing is left', () => {
    expect(find(entry('Anna'), [s], [link('s1', 'b1'), link('s1', 'b2')])).toEqual([])
  })

  it('skips ignored mentions by stable id', () => {
    const r = find(entry('Anna'), [s], [], [mentionId('e1', 'b2')])
    expect(r.map((m) => m.blockId)).toEqual(['b1'])
  })

  it('ignoring one entry does not hide another entry in the same block', () => {
    const r = find(entry('Anna', [], 'e2'), [s], [], [mentionId('e1', 'b1')])
    expect(r).toHaveLength(2)
  })
})

describe('findMentions: result shape', () => {
  it('has a stable id, ids and the block text', () => {
    const r = find(entry('Anna'), [scene('s1', p('b1', 'Hi Anna'))])
    expect(r[0]).toMatchObject({
      id: 'mention:e1:b1',
      entryId: 'e1',
      sceneId: 's1',
      blockId: 'b1',
      text: 'Hi Anna',
    })
    expect(mentionId('e1', 'b1')).toBe('mention:e1:b1')
    expect(find(entry('Anna'), [scene('s1', p('b1', 'Hi Anna'))])).toEqual(r)
  })

  it('lists scenes in the order given, blocks in document order', () => {
    const r = find(entry('Anna'), [
      scene('s2', p('c1', 'Anna'), p('c2', 'Anna')),
      scene('s1', p('b1', 'Anna')),
    ])
    expect(r.map((m) => m.blockId)).toEqual(['c1', 'c2', 'b1'])
  })
})

describe('blockTexts', () => {
  it('reads text blocks inside quotes and lists, with hard breaks as spaces and footnotes skipped', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          attrs: { id: 'q' },
          content: [
            {
              type: 'paragraph',
              attrs: { id: 'p1' },
              content: [
                { type: 'text', text: 'one' },
                { type: 'hardBreak' },
                { type: 'text', text: 'two' },
                { type: 'footnote', content: [{ type: 'text', text: 'secret' }] },
              ],
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              attrs: { id: 'li' },
              content: [p('p2', 'item')],
            },
          ],
        },
        { type: 'sceneBreak', attrs: { id: 'sb' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'no id' }] },
      ],
    }
    expect(blockTexts(doc)).toEqual([
      { blockId: 'p1', text: 'one two' },
      { blockId: 'p2', text: 'item' },
    ])
  })

  it('finds a footnote word nowhere', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'a' },
          content: [
            { type: 'text', text: 'x' },
            { type: 'footnote', content: [{ type: 'text', text: 'Anna' }] },
          ],
        },
      ],
    }
    expect(find(entry('Anna'), [{ id: 's', content: doc }])).toEqual([])
  })
})
