import { onBeforeUnmount, onMounted } from 'vue'

type KeyInfo = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
export type SearchShortcut = 'search' | 'switcher'

const isKey = (e: KeyInfo, letter: string) =>
  e.code === `Key${letter.toUpperCase()}` || e.key.toLowerCase() === letter

/**
 * Ctrl/Cmd+Shift+F = search, Ctrl/Cmd+P = quick switcher. Alt is never allowed, so
 * Ctrl+Alt+P (context panel) and AltGr combinations stay untouched.
 */
export function matchSearchShortcut(e: KeyInfo): SearchShortcut | null {
  if (e.altKey || !(e.ctrlKey || e.metaKey)) return null
  if (e.shiftKey) return isKey(e, 'f') ? 'search' : null
  return isKey(e, 'p') ? 'switcher' : null
}

const isMac = () => typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

/** Shortcut as shown in tooltips. */
export function shortcutLabel(which: SearchShortcut): string {
  const mod = isMac() ? 'Cmd' : 'Ctrl'
  return which === 'search' ? `${mod}+Shift+F` : `${mod}+P`
}

export function useSearchShortcuts(handler: (which: SearchShortcut) => void): void {
  const onKeydown = (e: KeyboardEvent) => {
    const which = matchSearchShortcut(e)
    if (!which) return
    e.preventDefault() // Ctrl+P would open the browser print dialog
    if (!e.isComposing && !e.repeat) handler(which)
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
