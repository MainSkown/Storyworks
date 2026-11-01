import { describe, expect, it } from 'vitest'
import { appendNoteToScene, noteToSceneContent } from './inbox'
import { inboxSchema } from './schemas/inbox'

const para = (id: string, t: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text: t }],
})
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks })
const counter = () => {
  let i = 0
  return () => `new-${++i}`
}

type Node = { attrs?: { id?: string }; content?: Node[] }
const idsOf = (node: Node, out: string[] = []): string[] => {
  if (node.attrs?.id) out.push(node.attrs.id)
  node.content?.forEach((c) => idsOf(c, out))
  return out
}
const blocksOf = (d: unknown) => (d as { content: Node[] }).content

describe('inboxSchema', () => {
  const valid = {
    version: 1,
    id: 'inbox',
    notes: [
      { id: 'n1', title: 'Idea', content: doc(para('a', 'x')) },
      { id: 'n2', content: doc() },
    ],
  }

  it('accepts notes with and without a title', () => {
    expect(inboxSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts an empty inbox', () => {
    expect(inboxSchema.safeParse({ version: 1, id: 'inbox', notes: [] }).success).toBe(true)
  })

  it('rejects a note without content', () => {
    const bad = { ...valid, notes: [{ id: 'n1' }] }
    expect(inboxSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a note id that is not a string', () => {
    const bad = { ...valid, notes: [{ id: 5, content: doc() }] }
    expect(inboxSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects the wrong version', () => {
    expect(inboxSchema.safeParse({ ...valid, version: 2 }).success).toBe(false)
  })

  it('rejects unknown keys', () => {
    expect(inboxSchema.safeParse({ ...valid, extra: true }).success).toBe(false)
  })
})

describe('appendNoteToScene', () => {
  const scene = doc(para('s1', 'first'), para('s2', 'second'))
  const note = doc(para('n1', 'note one'), para('n2', 'note two'))

  it('appends the note blocks after the scene blocks, in order', () => {
    const out = appendNoteToScene(scene, note, counter())
    expect(blocksOf(out).map((b) => JSON.stringify(b).match(/"text":"([^"]+)"/)?.[1])).toEqual([
      'first',
      'second',
      'note one',
      'note two',
    ])
  })

  it('keeps the scene blocks and their ids unchanged', () => {
    const out = appendNoteToScene(scene, note, counter())
    expect(blocksOf(out).slice(0, 2)).toEqual(blocksOf(scene))
  })

  it('gives every appended block a fresh id from newId', () => {
    const out = appendNoteToScene(scene, note, counter())
    expect(idsOf(out as Node).slice(2)).toEqual(['new-1', 'new-2'])
  })

  it('leaves no duplicate ids even when the note reuses a scene id', () => {
    const clash = doc(para('s1', 'copy'))
    const ids = idsOf(appendNoteToScene(scene, clash, counter()) as Node)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('renews ids of nested blocks too', () => {
    const nested = doc({
      type: 'bulletList',
      attrs: { id: 'l' },
      content: [{ type: 'listItem', attrs: { id: 'li' }, content: [para('inner', 'z')] }],
    })
    const ids = idsOf(appendNoteToScene(scene, nested, counter()) as Node).slice(2)
    expect(ids).toHaveLength(3)
    expect(ids.every((id) => id.startsWith('new-'))).toBe(true)
  })

  it('does not mutate its inputs', () => {
    const s = structuredClone(scene)
    const nt = structuredClone(note)
    appendNoteToScene(s, nt, counter())
    expect(s).toEqual(scene)
    expect(nt).toEqual(note)
  })
})

describe('noteToSceneContent', () => {
  const note = doc(para('n1', 'one'), para('n2', 'two'))

  it('keeps block order and content with fresh ids', () => {
    const out = noteToSceneContent(note, counter())
    expect(idsOf(out as Node)).toEqual(['new-1', 'new-2'])
    expect(blocksOf(out).map((b) => b.content?.[0])).toEqual(
      blocksOf(note).map((b) => b.content?.[0]),
    )
  })

  it('returns a doc node', () => {
    expect((noteToSceneContent(note, counter()) as { type: string }).type).toBe('doc')
  })

  it('does not mutate its input', () => {
    const copy = structuredClone(note)
    noteToSceneContent(note, counter())
    expect(note).toEqual(copy)
  })
})
