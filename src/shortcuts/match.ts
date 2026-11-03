export type KeyInfo = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

/** `mod` = Ctrl on Windows/Linux, Cmd on macOS (either is accepted). */
export interface Combo {
  mod: boolean
  alt: boolean
  shift: boolean
  key: string
}

// Combo key name -> [event.code, character]
const PUNCT: Record<string, [string, string]> = {
  Slash: ['Slash', '/'],
  Comma: ['Comma', ','],
  Period: ['Period', '.'],
  Semicolon: ['Semicolon', ';'],
  Quote: ['Quote', "'"],
  Backquote: ['Backquote', '`'],
  Minus: ['Minus', '-'],
  Equal: ['Equal', '='],
  BracketLeft: ['BracketLeft', '['],
  BracketRight: ['BracketRight', ']'],
  Backslash: ['Backslash', '\\'],
}
const KEY_RE = /^([A-Z0-9]|F([1-9]|1[0-2]))$/

const isKeyName = (k: string): boolean => KEY_RE.test(k) || k in PUNCT

export function parseCombo(s: string): Combo | null {
  const parts = s.split('+')
  const c: Combo = { mod: false, alt: false, shift: false, key: '' }
  for (const p of parts.slice(0, -1)) {
    if (p !== 'Mod' && p !== 'Alt' && p !== 'Shift') return null
    const f = p.toLowerCase() as 'mod' | 'alt' | 'shift'
    if (c[f]) return null
    c[f] = true
  }
  const key = parts[parts.length - 1]!
  if (!isKeyName(key)) return null
  c.key = key
  return c
}

export function formatCombo(c: Combo): string {
  return [c.mod && 'Mod', c.alt && 'Alt', c.shift && 'Shift', c.key].filter(Boolean).join('+')
}

/** Key name from the physical key, so Alt/layout changes to `key` don't matter. */
function keyFromCode(code: string): string | null {
  const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code)
  if (m) return (m[1] ?? m[2])!
  if (/^F([1-9]|1[0-2])$/.test(code)) return code
  return code in PUNCT ? code : null
}

function keyMatches(e: KeyInfo, key: string): boolean {
  if (keyFromCode(e.code) === key) return true
  const p = PUNCT[key]
  if (p) return e.key === p[1]
  return e.key.toLowerCase() === key.toLowerCase()
}

export function matchesCombo(e: KeyInfo, combo: string): boolean {
  const c = parseCombo(combo)
  if (!c) return false
  if (c.mod !== (e.ctrlKey || e.metaKey) || c.alt !== e.altKey || c.shift !== e.shiftKey) return false
  return keyMatches(e, c.key)
}

/** Canonical combo for a pressed key, or null for a lone modifier / unsupported key. */
export function comboFromEvent(e: KeyInfo): string | null {
  const key = keyFromCode(e.code)
  if (!key) return null
  return formatCombo({ mod: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, key })
}

export const isMac = (): boolean => typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

/** Combo as shown to the user. */
export function displayCombo(combo: string, mac = isMac()): string {
  return combo
    .split('+')
    .map((p) => (p === 'Mod' ? (mac ? 'Cmd' : 'Ctrl') : (PUNCT[p]?.[1] ?? p)))
    .join('+')
}
