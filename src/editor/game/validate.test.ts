import { describe, expect, it } from 'vitest'
import { gameContentProblem } from './validate'
import { sceneSchema, SCENE_VERSION } from '../../project/schemas/scene'

const line = (id: string, lineId: string, extra: Record<string, unknown> = {}) => ({
  type: 'line',
  attrs: { id, lineId, speakerId: null, speakerName: null, ...extra },
  content: [{ type: 'text', text: 'Hello' }],
})
const doc = (...c: unknown[]) => ({ type: 'doc', content: c })
const scene = (content: unknown) => ({ version: SCENE_VERSION, id: 's1', title: 'S', content })

describe('game script content', () => {
  it('accepts an empty doc and lines with unique line ids', () => {
    expect(gameContentProblem(doc())).toBeNull()
    expect(gameContentProblem(doc(line('a', 'L000001'), line('b', 'L000002')))).toBeNull()
  })

  it('accepts narration, a codex speaker and a plain-name speaker', () => {
    const d = doc(
      line('a', 'L000001'),
      line('b', 'L000002', { speakerId: 'e1' }),
      line('c', 'L000003', { speakerName: 'Old Man' }),
    )
    expect(gameContentProblem(d)).toBeNull()
  })

  it('accepts line ids longer than six digits', () => {
    expect(gameContentProblem(doc(line('a', 'L1234567')))).toBeNull()
  })

  it.each([['l000001'], ['L1'], ['000001'], ['L00000x'], ['']])('rejects line id %j', (bad) => {
    expect(gameContentProblem(doc(line('a', bad)))).not.toBeNull()
  })

  it('rejects a missing line id', () => {
    const l = { type: 'line', attrs: { id: 'a' }, content: [] }
    expect(gameContentProblem(doc(l))).not.toBeNull()
  })

  it('rejects a duplicate line id', () => {
    expect(gameContentProblem(doc(line('a', 'L000001'), line('b', 'L000001')))).toMatch(/L000001/)
  })

  it('rejects a speaker that is both a codex link and a plain name', () => {
    const d = doc(line('a', 'L000001', { speakerId: 'e1', speakerName: 'X' }))
    expect(gameContentProblem(d)).not.toBeNull()
  })

  it('rejects a speaker that is not a string', () => {
    expect(gameContentProblem(doc(line('a', 'L000001', { speakerId: 5 })))).not.toBeNull()
  })

  it('rejects other blocks mixed with lines', () => {
    const p = { type: 'paragraph', attrs: { id: 'p' }, content: [] }
    expect(gameContentProblem(doc(line('a', 'L000001'), p))).toBe('paragraph')
  })

  it('leaves docs without lines (books, screenplays) alone', () => {
    const p = { type: 'paragraph', attrs: { id: 'p' }, content: [] }
    expect(gameContentProblem(doc(p))).toBeNull()
  })
})

describe('scene schema with game lines', () => {
  it('loads a valid script', () => {
    expect(sceneSchema.safeParse(scene(doc(line('a', 'L000001')))).success).toBe(true)
  })

  it('rejects a duplicate line id and a bad line id', () => {
    expect(
      sceneSchema.safeParse(scene(doc(line('a', 'L000001'), line('b', 'L000001')))).success,
    ).toBe(false)
    expect(sceneSchema.safeParse(scene(doc(line('a', 'x')))).success).toBe(false)
  })
})

describe('line kinds', () => {
  const kindLine = (kind: unknown, extra: Record<string, unknown> = {}) =>
    line('a', 'L000001', { kind, ...extra })

  it('accepts speech, text and a missing kind (old files)', () => {
    expect(gameContentProblem(doc(kindLine('speech')))).toBeNull()
    expect(gameContentProblem(doc(kindLine('text')))).toBeNull()
    expect(gameContentProblem(doc(kindLine(undefined)))).toBeNull()
    expect(gameContentProblem(doc(kindLine(null)))).toBeNull()
  })

  it('rejects an unknown kind', () => {
    expect(gameContentProblem(doc(kindLine('shout')))).not.toBeNull()
  })

  it('rejects a text line that has a speaker', () => {
    expect(gameContentProblem(doc(kindLine('text', { speakerId: 'e1' })))).not.toBeNull()
    expect(gameContentProblem(doc(kindLine('text', { speakerName: 'Bob' })))).not.toBeNull()
  })
})
