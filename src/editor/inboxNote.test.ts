// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { inboxNoteKind } from './inboxNote'

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

describe('inboxNoteKind', () => {
  it('has no scene-only toolbar items', () => {
    const ids = inboxNoteKind.toolbar.map((i) => i.id)
    expect(ids).toContain('bold')
    expect(ids).not.toContain('sceneBreak')
    expect(ids).not.toContain('footnote')
    expect(ids.some((id) => id.startsWith('align'))).toBe(false)
  })

  it('gives note blocks ids and has no footnote or scene break nodes', () => {
    const editor = new Editor({
      extensions: inboxNoteKind.extensions(),
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
      },
    })
    editors.push(editor)
    const names = editor.extensionManager.extensions.map((e) => e.name)
    expect(names).not.toContain('footnote')
    expect(names).not.toContain('sceneBreak')
    expect(editor.getJSON().content?.[0]?.attrs?.id).toBeTruthy()
  })
})
