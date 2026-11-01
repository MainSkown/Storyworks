import type { CanConnect } from './types'

export type Dir = 'left' | 'right' | 'up' | 'down'
export interface Box {
  id: string
  x: number
  y: number
  w: number
  h: number
}

const center = (b: Box) => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2 })

/** Nearest node in a direction: forward distance plus a doubled sideways penalty. */
export function nearestInDirection(boxes: Box[], fromId: string, dir: Dir): string | null {
  const from = boxes.find((b) => b.id === fromId)
  if (!from) return null
  const f = center(from)
  let best: { id: string; score: number } | null = null
  for (const b of boxes) {
    if (b.id === fromId) continue
    const c = center(b)
    const dx = c.cx - f.cx
    const dy = c.cy - f.cy
    const forward = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy
    if (forward <= 0) continue
    const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    const score = forward + 2 * side
    if (!best || score < best.score || (score === best.score && b.id < best.id)) {
      best = { id: b.id, score }
    }
  }
  return best?.id ?? null
}

/** Closest other node in any direction, e.g. where focus goes after a delete. */
export function nearestAny(boxes: Box[], fromId: string): string | null {
  const from = boxes.find((b) => b.id === fromId)
  if (!from) return null
  const f = center(from)
  let best: { id: string; d: number } | null = null
  for (const b of boxes) {
    if (b.id === fromId) continue
    const c = center(b)
    const d = Math.hypot(c.cx - f.cx, c.cy - f.cy)
    if (!best || d < best.d || (d === best.d && b.id < best.id)) best = { id: b.id, d }
  }
  return best?.id ?? null
}

export function nudgeDelta(dir: Dir, step: number): { dx: number; dy: number } {
  switch (dir) {
    case 'left':
      return { dx: -step, dy: 0 }
    case 'right':
      return { dx: step, dy: 0 }
    case 'up':
      return { dx: 0, dy: -step }
    case 'down':
      return { dx: 0, dy: step }
  }
}

export type KeyAction =
  | { type: 'focus'; dir: Dir }
  | { type: 'nudge'; dir: Dir }
  | { type: 'open' }
  | { type: 'add' }
  | { type: 'connect' }
  | { type: 'delete' }
  | { type: 'confirm' }
  | { type: 'cancel' }

const ARROWS: Record<string, Dir> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

export function keyToAction(
  e: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean },
  connecting: boolean,
): KeyAction | null {
  if (e.ctrlKey || e.metaKey) return null
  const dir = ARROWS[e.key]
  if (dir) {
    if (e.altKey) return connecting ? null : { type: 'nudge', dir }
    return { type: 'focus', dir }
  }
  if (e.altKey) return null
  if (connecting) {
    if (e.key === 'Enter') return { type: 'confirm' }
    if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') return { type: 'cancel' }
    return null
  }
  switch (e.key) {
    case 'Enter':
      return { type: 'open' }
    case 'n':
    case 'N':
      return { type: 'add' }
    case 'c':
    case 'C':
      return { type: 'connect' }
    case 'Delete':
    case 'Backspace':
      return { type: 'delete' }
    default:
      return null
  }
}

export type ConnectState = { mode: 'idle' } | { mode: 'connecting'; from: string; target: string }

export type ConnectAction =
  | { type: 'start'; from: string }
  | { type: 'target'; id: string }
  | { type: 'confirm' }
  | { type: 'cancel' }

export type ConnectEffect =
  | { type: 'started'; from: string }
  | { type: 'target'; id: string }
  | { type: 'connect'; from: string; to: string }
  /** `reason` is null when the target is the source itself. */
  | { type: 'rejected'; reason: string | null }
  | { type: 'cancelled' }

export function connectReduce(
  state: ConnectState,
  action: ConnectAction,
  canConnect: CanConnect,
): { state: ConnectState; effect: ConnectEffect | null } {
  if (state.mode === 'idle') {
    if (action.type === 'start') {
      return {
        state: { mode: 'connecting', from: action.from, target: action.from },
        effect: { type: 'started', from: action.from },
      }
    }
    return { state, effect: null }
  }
  switch (action.type) {
    case 'target':
      return {
        state: { ...state, target: action.id },
        effect: { type: 'target', id: action.id },
      }
    case 'cancel':
      return { state: { mode: 'idle' }, effect: { type: 'cancelled' } }
    case 'confirm': {
      if (state.target === state.from) {
        return { state, effect: { type: 'rejected', reason: null } }
      }
      const res = canConnect(state.from, state.target)
      if (!res.ok) return { state, effect: { type: 'rejected', reason: res.reason } }
      return {
        state: { mode: 'idle' },
        effect: { type: 'connect', from: state.from, to: state.target },
      }
    }
    default:
      return { state, effect: null }
  }
}
