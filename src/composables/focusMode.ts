import { ref } from 'vue'

/** Focus (distraction-free) mode; shared by the shell and the Write view. */
export const focusMode = ref(false)

type KeyInfo = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

/** Ctrl/Cmd+Shift+F. */
export function isFocusShortcut(e: KeyInfo): boolean {
  if (e.altKey || !e.shiftKey || !(e.ctrlKey || e.metaKey)) return false
  return e.code === 'KeyF' || e.key.toLowerCase() === 'f'
}
