// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { editorKinds } from './kinds'
import { sceneSchema, SCENE_VERSION } from '../project/schemas/scene'
import en from '../locales/en.json'
import pl from '../locales/pl.json'

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

function load(content: JSONContent): JSONContent {
  const editor = new Editor({ extensions: editorKinds.book!.extensions(), content })
  editors.push(editor)
  return editor.getJSON()
}

const text = (t: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'text',
  text: t,
  ...(marks ? { marks } : {}),
})

// Ends with a paragraph so the trailing-node plugin has nothing to add.
const doc: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { id: 'h', textAlign: 'center', level: 2 },
      content: [text('Title')],
    },
    {
      type: 'paragraph',
      attrs: { id: 'p1', textAlign: 'justify' },
      content: [
        text('Said '),
        text('hello', [{ type: 'comment', attrs: { commentId: 'c1' } }]),
        { type: 'footnote', content: [text('A note')] },
        text(' and left.'),
      ],
    },
    { type: 'sceneBreak', attrs: { id: 'sb' } },
    {
      type: 'image',
      attrs: {
        id: 'img',
        src: 'assets/abc.png',
        alt: null,
        title: null,
        width: null,
        height: null,
      },
    },
    {
      type: 'blockquote',
      attrs: { id: 'q', textAlign: 'right' },
      content: [
        { type: 'paragraph', attrs: { id: 'p2', textAlign: null }, content: [text('quoted')] },
      ],
    },
    { type: 'paragraph', attrs: { id: 'p3', textAlign: null }, content: [text('end')] },
  ],
}

describe('book editor kind', () => {
  it('keeps alignment, footnote, image, scene break and comment mark through load and getJSON', () => {
    expect(load(doc)).toEqual(doc)
  })

  it('produces content that passes the scene block-id check', () => {
    const content = load(doc)
    const scene = {
      version: SCENE_VERSION,
      id: 's1',
      title: 'Scene',
      content,
    }
    expect(sceneSchema.safeParse(scene).success).toBe(true)
  })

  it('gives a scene break without an id one, unique among blocks', () => {
    const content = load({
      type: 'doc',
      content: [{ type: 'sceneBreak' }, { type: 'sceneBreak' }, { type: 'paragraph' }],
    })
    const ids = content.content!.map((n) => n.attrs?.id as string)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(3)
  })

  it('leaves the cursor after an inserted scene break so typing does not replace it', () => {
    const editor = new Editor({
      extensions: editorKinds.book!.extensions(),
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    editors.push(editor)
    editor.commands.focus('end')
    editor.chain().setSceneBreak().insertContent('after').run()
    const types = editor.getJSON().content!.map((n) => n.type)
    expect(types).toContain('sceneBreak')
    expect(JSON.stringify(editor.getJSON())).toContain('after')
  })

  it('rejects a duplicate id through the scene schema', () => {
    const dup = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'x' } },
        { type: 'paragraph', attrs: { id: 'x' } },
      ],
    }
    expect(
      sceneSchema.safeParse({ version: SCENE_VERSION, id: 's', title: 't', content: dup }).success,
    ).toBe(false)
  })

  it('has en and pl labels for every toolbar item', () => {
    const get = (m: unknown, key: string) =>
      key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], m)
    for (const item of editorKinds.book!.toolbar) {
      expect(get(en, item.labelKey), `en ${item.labelKey}`).toBeTruthy()
      expect(get(pl, item.labelKey), `pl ${item.labelKey}`).toBeTruthy()
    }
  })
})
