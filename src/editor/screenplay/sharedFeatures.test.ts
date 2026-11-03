// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { editorKinds } from '../kinds'
import { countWords } from '../wordCount'
import { commentIdsIn, commentRanges } from '../comments'
import { textUnits } from '../spellRanges'
import { docToText } from '../../project/plainText'
import { docText } from '../../relations/form'
import { blockTexts, findMentions } from '../../codex/mentions'
import { buildIndex } from '../../search/build'
import { search } from '../../search/query'
import { addCodexLink, addLink, createLinkIndex } from '../../project/links'
import { blockIds, sceneSchema } from '../../project/schemas/scene'
import { createSnapshot } from '../../history/snapshot'
import { restoreItem } from '../../history/restore'
import { makeKit } from '../../history/testKit'
import type { ElementType } from './rules'

const el = (type: ElementType, id: string, text = ''): JSONContent => ({
  type,
  attrs: { id },
  ...(text ? { content: [{ type: 'text', text }] } : {}),
})
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })

const script = doc(
  el('sceneHeading', 'h1', 'INT. KITCHEN - DAY'),
  el('action', 'a1', 'Anna pours the tea.'),
  el('character', 'c1', 'ANNA'),
  el('parenthetical', 'p1', '(quietly)'),
  el('dialogue', 'd1', 'Where did you put the key?'),
  el('transition', 't1', 'CUT TO:'),
)

const editors: Editor[] = []
function makeEditor(content: JSONContent): Editor {
  const e = new Editor({ extensions: editorKinds.screenplay!.extensions(), content })
  editors.push(e)
  return e
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

describe('text and counts', () => {
  it('docToText gives one line per element block', () => {
    expect(docToText(script).split('\n')).toEqual([
      'INT. KITCHEN - DAY',
      'Anna pours the tea.',
      'ANNA',
      '(quietly)',
      'Where did you put the key?',
      'CUT TO:',
    ])
  })

  it('counts words across all element types, ignoring empty blocks', () => {
    expect(countWords(doc(...script.content!, el('action', 'a2')))).toBe(4 + 4 + 1 + 1 + 6 + 2)
  })

  it('docText keeps neighbouring elements apart', () => {
    expect(docText(script, 500)).toBe(
      'INT. KITCHEN - DAY Anna pours the tea. ANNA (quietly) Where did you put the key? CUT TO:',
    )
  })

  it('blockTexts lists every element block with its id', () => {
    expect(blockTexts(script).map((b) => b.blockId)).toEqual(['h1', 'a1', 'c1', 'p1', 'd1', 't1'])
  })
})

describe('search', () => {
  it('finds a line of dialogue and reports its block', () => {
    const ix = buildIndex({
      tree: [
        { id: 's1', type: 'scene', title: 'Kitchen', path: 'manuscript/s1.json', children: [] },
      ],
      sceneContent: new Map([['s1', script]]),
      rules: [],
      timelines: [],
      entries: [],
      knowledge: [],
    })
    const hit = search(ix, 'put the key').groups[0].hits[0]
    expect(hit.id).toBe('s1')
    expect(hit.blockId).toBe('d1')
  })
})

describe('mentions and spellcheck', () => {
  it('finds a codex name in an action line and gives its block', () => {
    const m = findMentions(
      { id: 'e1', name: 'Anna', aliases: [] },
      [{ id: 's1', content: script }],
      [],
      new Set(),
    )
    expect(m.map((x) => x.blockId)).toContain('a1')
  })

  it('every non-empty element block is a spellcheck unit', () => {
    const e = makeEditor(script)
    expect(textUnits(e.state.doc).map((u) => u.node.type.name)).toEqual([
      'sceneHeading',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'transition',
    ])
  })
})

describe('links survive Enter-splitting', () => {
  function splitDialogue(at: 'middle' | 'end') {
    const e = makeEditor(script)
    let from = 0
    e.state.doc.forEach((n, offset) => {
      if (n.type.name === 'dialogue') from = offset + 1
    })
    e.commands.setTextSelection(
      at === 'end' ? from + 'Where did you put the key?'.length : from + 5,
    )
    e.commands.keyboardShortcut('Enter')
    return e
  }

  it.each(['middle', 'end'] as const)(
    'an event, rule and codex link keep their block (%s)',
    (at) => {
      let links = addLink([], {
        from: { item: 's1', block: 'd1' },
        to: { item: 'tl1', block: 'n1' },
      }).links
      // A rule link is an event-kind link whose target block lives in a rule.
      links = addLink(links, {
        from: { item: 's1', block: 'd1' },
        to: { item: 'r1', block: 'rb1' },
      }).links
      links = addCodexLink(links, { sceneId: 's1', blockId: 'd1', entryId: 'e1' }).links

      const e = splitDialogue(at)
      const present = new Set(blockIds(e.getJSON()))
      expect(present.has('d1')).toBe(true)

      const index = createLinkIndex({ isLive: () => true, blockExists: (_i, b) => present.has(b) })
      index.setLinks('s1', links)
      expect(links.map((l) => index.isPassageBroken(l))).toEqual([false, false, false])
    },
  )

  it('the split-off half gets a fresh unique id and the type follows the rule', () => {
    const e = splitDialogue('middle')
    const blocks = e.getJSON().content!
    const ids = blocks.map((b) => b.attrs!.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(blocks.map((b) => b.type)).toEqual([
      'sceneHeading',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'dialogue',
      'transition',
    ])
    expect(blocks[4].attrs!.id).toBe('d1')
  })
})

describe('margin comments', () => {
  it('a comment on a dialogue range is found in the JSON and as a range', () => {
    const e = makeEditor(script)
    let start = 0
    e.state.doc.forEach((n, offset) => {
      if (n.type.name === 'dialogue') start = offset + 1
    })
    e.commands.setTextSelection({ from: start + 6, to: start + 9 })
    e.commands.setComment('cm1')
    expect(commentIdsIn(e.getJSON())).toEqual(new Set(['cm1']))
    const r = commentRanges(e.state.doc)!.get('cm1')!
    expect(e.state.doc.textBetween(r.from, r.to)).toBe('did')
    // Reloading the saved JSON keeps the mark on the dialogue block.
    const again = makeEditor(e.getJSON())
    expect(commentRanges(again.state.doc).has('cm1')).toBe(true)
  })
})

describe('snapshot restore', () => {
  it('brings back typed blocks and their ids byte for byte', async () => {
    const k = await makeKit()
    const file = (content: JSONContent) =>
      JSON.stringify(
        sceneSchema.parse({ version: 3, id: 's1', title: 'Scene 1', content }),
        null,
        2,
      ) + '\n'
    await k.scene('s1', file(script))
    const { id } = await createSnapshot(k.engine, k.io, k.env, { keys: 'all' })
    await k.scene('s1', file(doc(el('action', 'zz', 'changed'))))
    await restoreItem(k.engine, k.io, id, 'node:s1', {
      env: k.env,
      readOnly: false,
      makeSafetyBackup: async () => 'b',
    })
    const back = sceneSchema.parse(JSON.parse(k.text('manuscript/s1.json')!))
    expect(back.content).toEqual(script)
    expect(blockIds(back.content)).toEqual(['h1', 'a1', 'c1', 'p1', 'd1', 't1'])
  })
})
