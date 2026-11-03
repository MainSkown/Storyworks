import { ref } from 'vue'

/** Focus (distraction-free) mode; shared by the shell and the Write view. */
export const focusMode = ref(false)

type KeyInfo = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

/** Ctrl/Cmd+Alt+F (Ctrl/Cmd+Shift+F is global search). Physical key: Alt changes `key` on some layouts. */
export function isFocusShortcut(e: KeyInfo): boolean {
  if (!e.altKey || e.shiftKey || !(e.ctrlKey || e.metaKey)) return false
  return e.code === 'KeyF' || e.key.toLowerCase() === 'f'
}
