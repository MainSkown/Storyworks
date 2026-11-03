import { describe, expect, it } from 'vitest'
import { storyMapSchema, STORY_MAP_VERSION } from './storyMap'

const base = { version: STORY_MAP_VERSION, boxes: [], arrows: [] }
const item = (id: string, itemId: string) => ({ id, kind: 'item', itemId, x: 0, y: 0 })
const beat = (id: string, text = 'Twist') => ({ id, kind: 'beat', text, x: 10, y: 20, start: true })
const ok = (v: unknown) => storyMapSchema.safeParse(v).success

describe('story map schema', () => {
  it('an empty map loads', () => {
    expect(ok(base)).toBe(true)
    expect(ok({ version: STORY_MAP_VERSION })).toBe(true)
  })

  it('a full map round trips through JSON', () => {
    const v = storyMapSchema.parse({
      ...base,
      boxes: [item('b1', 'c1'), item('b2', 'c2'), beat('b3')],
      arrows: [
        { id: 'a1', from: 'b1', to: 'b2', condition: { mode: 'all', terms: [{ variableId: 'v', op: 'isTrue' }] } },
        { id: 'a2', from: 'b2', to: 'b3' },
      ],
    })
    expect(storyMapSchema.parse(JSON.parse(JSON.stringify(v)))).toEqual(v)
    expect(v.boxes[0]).toMatchObject({ start: false })
  })

  it('loops and cycles are allowed', () => {
    expect(
      ok({
        ...base,
        boxes: [item('b1', 'c1'), item('b2', 'c2')],
        arrows: [
          { id: 'a1', from: 'b1', to: 'b2' },
          { id: 'a2', from: 'b2', to: 'b1' },
          { id: 'a3', from: 'b1', to: 'b1' },
        ],
      }),
    ).toBe(true)
  })

  it('rejects a wrong version, unknown fields and a bad kind', () => {
    expect(ok({ ...base, version: 2 })).toBe(false)
    expect(ok({ ...base, extra: 1 })).toBe(false)
    expect(ok({ ...base, boxes: [{ id: 'b', kind: 'x', x: 0, y: 0 }] })).toBe(false)
    expect(ok({ ...base, boxes: [{ ...item('b', 'c'), junk: 1 }] })).toBe(false)
  })

  it('rejects duplicate box ids, duplicate arrow ids and two boxes for one item', () => {
    expect(ok({ ...base, boxes: [item('b', 'c1'), item('b', 'c2')] })).toBe(false)
    const boxes = [item('b1', 'c1'), item('b2', 'c2')]
    expect(
      ok({ ...base, boxes, arrows: [{ id: 'a', from: 'b1', to: 'b2' }, { id: 'a', from: 'b2', to: 'b1' }] }),
    ).toBe(false)
    expect(ok({ ...base, boxes: [item('b1', 'c1'), item('b2', 'c1')] })).toBe(false)
  })

  it('rejects an arrow to a missing box, and a second arrow for the same pair', () => {
    const boxes = [item('b1', 'c1'), item('b2', 'c2')]
    expect(ok({ ...base, boxes, arrows: [{ id: 'a', from: 'b1', to: 'zz' }] })).toBe(false)
    expect(
      ok({ ...base, boxes, arrows: [{ id: 'a', from: 'b1', to: 'b2' }, { id: 'b', from: 'b1', to: 'b2' }] }),
    ).toBe(false)
  })

  it('rejects an empty condition and a non-finite position', () => {
    const boxes = [item('b1', 'c1'), item('b2', 'c2')]
    const arrow = { id: 'a', from: 'b1', to: 'b2', condition: { mode: 'all', terms: [] } }
    expect(ok({ ...base, boxes, arrows: [arrow] })).toBe(false)
    expect(ok({ ...base, boxes: [{ ...item('b', 'c'), x: Infinity }] })).toBe(false)
  })
})
