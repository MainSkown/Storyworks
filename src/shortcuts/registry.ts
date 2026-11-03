import { matchesCombo, parseCombo, formatCombo, type KeyInfo } from './match'

/** Where the action works: everywhere in the app, or only in the Write view. */
export type ShortcutScope = 'app' | 'write'

export const SHORTCUTS = [
  { id: 'search', combo: 'Mod+Shift+F', scope: 'app' },
  { id: 'switcher', combo: 'Mod+P', scope: 'app' },
  { id: 'panelToggle', combo: 'Mod+Alt+P', scope: 'app' },
  { id: 'shortcutOverlay', combo: 'Mod+Slash', scope: 'app' },
  { id: 'focusMode', combo: 'Mod+Alt+F', scope: 'write' },
] as const satisfies readonly { id: string; combo: string; scope: ShortcutScope }[]

export type ShortcutId = (typeof SHORTCUTS)[number]['id']
export type Combos = Record<ShortcutId, string>

/** Label key of an action: `shortcuts.actions.<id>`. */
export const actionLabelKey = (id: ShortcutId): string => `shortcuts.actions.${id}`

/** Editor keys defined by TipTap; fixed, listed in the overlay and checked for conflicts. */
export const FIXED_SHORTCUTS = [
  { id: 'bold', combo: 'Mod+B' },
  { id: 'italic', combo: 'Mod+I' },
  { id: 'underline', combo: 'Mod+U' },
  { id: 'heading1', combo: 'Mod+Alt+1' },
  { id: 'heading2', combo: 'Mod+Alt+2' },
  { id: 'heading3', combo: 'Mod+Alt+3' },
  { id: 'bulletList', combo: 'Mod+Shift+8' },
  { id: 'orderedList', combo: 'Mod+Shift+7' },
  { id: 'blockquote', combo: 'Mod+Shift+B' },
  { id: 'alignLeft', combo: 'Mod+Shift+L' },
  { id: 'alignCenter', combo: 'Mod+Shift+E' },
  { id: 'alignRight', combo: 'Mod+Shift+R' },
  { id: 'alignJustify', combo: 'Mod+Shift+J' },
  { id: 'eventLink', combo: 'Mod+Shift+K' },
  { id: 'undo', combo: 'Mod+Z' },
  { id: 'redo', combo: 'Mod+Shift+Z' },
] as const
export type FixedShortcutId = (typeof FIXED_SHORTCUTS)[number]['id']

export const fixedLabelKey = (id: FixedShortcutId): string => `shortcuts.fixed.${id}`

export function isShortcutId(id: string): id is ShortcutId {
  return SHORTCUTS.some((s) => s.id === id)
}

export function defaultCombos(): Combos {
  return Object.fromEntries(SHORTCUTS.map((s) => [s.id, s.combo])) as Combos
}

/** Defaults plus the user's overrides; unknown ids and unparsable combos are ignored. */
export function effectiveCombos(overrides: Record<string, string>): Combos {
  const out = defaultCombos()
  for (const [id, combo] of Object.entries(overrides)) {
    const parsed = isShortcutId(id) ? parseCombo(combo) : null
    if (isShortcutId(id) && parsed) out[id] = formatCombo(parsed)
  }
  return out
}

/** The action a key press triggers (registry order wins on a hand-edited clash). */
export function matchShortcut(
  e: KeyInfo,
  combos: Combos,
  only?: ReadonlySet<ShortcutId>,
): ShortcutId | null {
  for (const s of SHORTCUTS) {
    if (only && !only.has(s.id)) continue
    if (matchesCombo(e, combos[s.id])) return s.id
  }
  return null
}
