import { describe, expect, it } from 'vitest'
import {
  connectReduce,
  type ConnectState,
  keyToAction,
  nearestAny,
  nearestInDirection,
  nudgeDelta,
  type Box,
} from './keyboard'

const box = (id: string, x: number, y: number): Box => ({ id, x, y, w: 100, h: 50 })

describe('nearestInDirection', () => {
  const nodes = [
    box('a', 0, 0),
    box('b', 300, 0),
    box('c', 300, 200),
    box('d', 0, 200),
    box('e', 600, 10),
  ]

  it('picks the nearest node to the right, preferring alignment', () => {
    expect(nearestInDirection(nodes, 'a', 'right')).toBe('b')
    expect(nearestInDirection(nodes, 'b', 'right')).toBe('e')
  })

  it('works in all four directions', () => {
    expect(nearestInDirection(nodes, 'a', 'down')).toBe('d')
    expect(nearestInDirection(nodes, 'c', 'left')).toBe('d')
    expect(nearestInDirection(nodes, 'c', 'up')).toBe('b')
  })

  it('returns null when nothing lies that way', () => {
    expect(nearestInDirection(nodes, 'a', 'left')).toBeNull()
    expect(nearestInDirection(nodes, 'a', 'up')).toBeNull()
  })

  it('prefers an aligned farther node over a close but off-axis one', () => {
    const ns = [box('a', 0, 0), box('near', 150, 400), box('far', 500, 0)]
    expect(nearestInDirection(ns, 'a', 'right')).toBe('far')
  })

  it('returns null for an unknown origin and breaks ties by id', () => {
    expect(nearestInDirection(nodes, 'zzz', 'right')).toBeNull()
    const tie = [box('o', 0, 0), box('y', 200, 100), box('x', 200, -100)]
    expect(nearestInDirection(tie, 'o', 'right')).toBe('x')
  })
})

describe('nearestAny', () => {
  it('returns the closest other node, or null when alone', () => {
    const ns = [box('a', 0, 0), box('b', 120, 0), box('c', 900, 0)]
    expect(nearestAny(ns, 'a')).toBe('b')
    expect(nearestAny([box('a', 0, 0)], 'a')).toBeNull()
  })
})

describe('nudgeDelta', () => {
  it('maps directions to offsets', () => {
    expect(nudgeDelta('left', 10)).toEqual({ dx: -10, dy: 0 })
    expect(nudgeDelta('down', 10)).toEqual({ dx: 0, dy: 10 })
  })
})

describe('keyToAction', () => {
  const k = (key: string, extra: Partial<Parameters<typeof keyToAction>[0]> = {}) =>
    keyToAction({ key, altKey: false, ctrlKey: false, metaKey: false, ...extra }, false)

  it('maps plain keys', () => {
    expect(k('ArrowUp')).toEqual({ type: 'focus', dir: 'up' })
    expect(k('Enter')).toEqual({ type: 'open' })
    expect(k('n')).toEqual({ type: 'add' })
    expect(k('N')).toEqual({ type: 'add' })
    expect(k('c')).toEqual({ type: 'connect' })
    expect(k('Delete')).toEqual({ type: 'delete' })
    expect(k('x')).toBeNull()
  })

  it('maps Alt+arrows to nudge and ignores ctrl/meta combos', () => {
    expect(k('ArrowLeft', { altKey: true })).toEqual({ type: 'nudge', dir: 'left' })
    expect(k('n', { ctrlKey: true })).toBeNull()
    expect(k('c', { metaKey: true })).toBeNull()
  })

  it('changes meaning while connecting', () => {
    const c = (key: string, alt = false) =>
      keyToAction({ key, altKey: alt, ctrlKey: false, metaKey: false }, true)
    expect(c('Enter')).toEqual({ type: 'confirm' })
    expect(c('Escape')).toEqual({ type: 'cancel' })
    expect(c('ArrowRight')).toEqual({ type: 'focus', dir: 'right' })
    expect(c('ArrowRight', true)).toBeNull()
    expect(c('n')).toBeNull()
    expect(c('Delete')).toBeNull()
    expect(c('c')).toEqual({ type: 'cancel' })
  })
})

describe('connectReduce', () => {
  const idle: ConnectState = { mode: 'idle' }
  const ok = () => ({ ok: true as const })
  const no = () => ({ ok: false as const, reason: 'cycle' })

  it('starts from the focused node with itself as target', () => {
    const r = connectReduce(idle, { type: 'start', from: 'a' }, ok)
    expect(r.state).toEqual({ mode: 'connecting', from: 'a', target: 'a' })
    expect(r.effect).toEqual({ type: 'started', from: 'a' })
  })

  it('ignores start while already connecting', () => {
    const s: ConnectState = { mode: 'connecting', from: 'a', target: 'b' }
    expect(connectReduce(s, { type: 'start', from: 'x' }, ok).state).toBe(s)
  })

  it('moves the target', () => {
    const s: ConnectState = { mode: 'connecting', from: 'a', target: 'a' }
    const r = connectReduce(s, { type: 'target', id: 'b' }, ok)
    expect(r.state).toEqual({ mode: 'connecting', from: 'a', target: 'b' })
    expect(r.effect).toEqual({ type: 'target', id: 'b' })
  })

  it('confirms an allowed connection and returns to idle', () => {
    const s: ConnectState = { mode: 'connecting', from: 'a', target: 'b' }
    const r = connectReduce(s, { type: 'confirm' }, ok)
    expect(r.state).toEqual(idle)
    expect(r.effect).toEqual({ type: 'connect', from: 'a', to: 'b' })
  })

  it('keeps connecting and reports the reason when rejected', () => {
    const s: ConnectState = { mode: 'connecting', from: 'a', target: 'b' }
    const r = connectReduce(s, { type: 'confirm' }, no)
    expect(r.state).toBe(s)
    expect(r.effect).toEqual({ type: 'rejected', reason: 'cycle' })
  })

  it('rejects confirming on the source itself without asking canConnect', () => {
    const s: ConnectState = { mode: 'connecting', from: 'a', target: 'a' }
    const r = connectReduce(s, { type: 'confirm' }, ok)
    expect(r.state).toBe(s)
    expect(r.effect).toEqual({ type: 'rejected', reason: null })
  })

  it('cancels, and ignores confirm/cancel when idle', () => {
    const s: ConnectState = { mode: 'connecting', from: 'a', target: 'b' }
    expect(connectReduce(s, { type: 'cancel' }, ok)).toEqual({
      state: idle,
      effect: { type: 'cancelled' },
    })
    expect(connectReduce(idle, { type: 'confirm' }, ok).effect).toBeNull()
    expect(connectReduce(idle, { type: 'cancel' }, ok).effect).toBeNull()
  })
})
