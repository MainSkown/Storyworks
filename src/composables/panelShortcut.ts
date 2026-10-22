import { onBeforeUnmount, onMounted } from 'vue'

type KeyInfo = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

/** Ctrl/Cmd+Alt+P. Uses the physical key: Alt changes `key` on some layouts. */
export function isPanelToggleShortcut(e: KeyInfo): boolean {
  if (!e.altKey || e.shiftKey || !(e.ctrlKey || e.metaKey)) return false
  return e.code === 'KeyP' || e.key.toLowerCase() === 'p'
}

export function usePanelShortcut(toggle: () => void): void {
  const onKeydown = (e: KeyboardEvent) => {
    if (!isPanelToggleShortcut(e)) return
    e.preventDefault()
    toggle()
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
