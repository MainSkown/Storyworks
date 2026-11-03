import { formatCombo, parseCombo } from './match'
import { FIXED_SHORTCUTS, SHORTCUTS, type Combos, type FixedShortcutId, type ShortcutId } from './registry'

export type Conflict =
  | { kind: 'shortcut'; id: ShortcutId }
  | { kind: 'fixed'; id: FixedShortcutId }
  | { kind: 'reserved' }

// Taken by the OS, the webview or the browser; the app never sees or should not steal them.
const RESERVED = new Set([
  ...'QWTNRLSOACVXZYHDGJ'.split('').map((k) => `Mod+${k}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `Mod+${n}`),
  'Mod+Minus',
  'Mod+Equal',
  'Mod+Shift+T',
  'Mod+Shift+N',
  'Mod+Shift+R',
  'Mod+Shift+I',
  'Mod+Shift+J',
  'Mod+Shift+Z',
  'Mod+Shift+Equal',
])

/** Why a combo cannot be used at all, or null. Combos need Ctrl/Cmd so typing is never hijacked. */
export function validateCombo(combo: string): 'invalid' | 'needsModifier' | null {
  const c = parseCombo(combo)
  if (!c) return 'invalid'
  return c.mod ? null : 'needsModifier'
}

/** What `combo` would collide with if given to `id` (`combos` = current effective keys). */
export function findConflict(id: ShortcutId, combo: string, combos: Combos): Conflict | null {
  const c = parseCombo(combo)
  if (!c) return null
  const norm = formatCombo(c)
  const fixed = FIXED_SHORTCUTS.find((f) => f.combo === norm)
  if (fixed) return { kind: 'fixed', id: fixed.id }
  const other = SHORTCUTS.find((s) => s.id !== id && combos[s.id] === norm)
  if (other) return { kind: 'shortcut', id: other.id }
  return RESERVED.has(norm) ? { kind: 'reserved' } : null
}
