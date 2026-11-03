import { describe, expect, it } from 'vitest'
import { backEdgePath, isBackEdge, roundedPath, type Rect } from './edgePath'

const box = (x: number, y: number, w = 200, h = 72): Rect => ({ x, y, w, h })

describe('isBackEdge', () => {
  it('is false when the target is to the right of the source handle', () => {
    expect(isBackEdge({ x: 200, y: 36 }, { x: 220, y: 36 })).toBe(false)
  })
  it('is true for a target at or left of the source handle, and for a self edge', () => {
    expect(isBackEdge({ x: 440, y: 36 }, { x: 0, y: 36 })).toBe(true)
    expect(isBackEdge({ x: 200, y: 36 }, { x: 0, y: 36 })).toBe(true)
  })
})

describe('roundedPath', () => {
  it('starts and ends at the end points', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      10,
    )
    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d.endsWith('L 100 100')).toBe(true)
    expect(d).toContain('Q 100 0')
  })
  it('shrinks the radius on short segments instead of overshooting', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      50,
    )
    expect(d).toContain('L 5 0')
  })
})

describe('backEdgePath', () => {
  const s = { x: 440, y: 36 }
  const t = { x: 0, y: 36 }

  it('connects the two handles', () => {
    const r = backEdgePath(s, t, [box(0, 0), box(440 - 200, 0)])
    expect(r.path.startsWith('M 440 36')).toBe(true)
    expect(r.path.endsWith('L 0 36')).toBe(true)
  })

  it('runs below every node it passes, and the label sits on that run', () => {
    const boxes = [box(0, 0), box(220, 0), box(240, 60)]
    const r = backEdgePath(s, t, boxes)
    expect(r.side).toBe('below')
    expect(r.labelY).toBeGreaterThan(60 + 72)
  })

  it('goes over the top when a tall obstacle is below', () => {
    const boxes = [box(0, 0), box(240, 0), box(120, 100, 200, 900)]
    const r = backEdgePath(s, t, boxes)
    expect(r.side).toBe('above')
    expect(r.labelY).toBeLessThan(0)
  })

  it('keeps parallel edges apart with lanes', () => {
    const boxes = [box(0, 0), box(240, 0)]
    const a = backEdgePath(s, t, boxes, { lane: 0 })
    const b = backEdgePath(s, t, boxes, { lane: 1 })
    expect(Math.abs(b.labelY - a.labelY)).toBeGreaterThan(8)
  })

  it('makes a small loop under the node for a self edge', () => {
    const r = backEdgePath({ x: 200, y: 36 }, { x: 0, y: 36 }, [box(0, 0)])
    expect(r.side).toBe('below')
    expect(r.labelY).toBeGreaterThan(72)
    expect(r.labelY).toBeLessThan(72 + 80)
  })
})
