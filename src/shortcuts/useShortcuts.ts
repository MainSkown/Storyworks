import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '../settings/store'
import { displayCombo } from './match'
import { effectiveCombos, matchShortcut, type Combos, type ShortcutId } from './registry'

export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>

// One window listener serves every component that registered handlers.
const registered = new Set<ShortcutHandlers>()
let combosSource: (() => Combos) | null = null
let listening = false

/** Shortcut overlay (Ctrl/Cmd+/); opened by the shell, also from Settings. */
export const overlayOpen = ref(false)

function onKeydown(e: KeyboardEvent): void {
  if (!combosSource || e.isComposing) return
  const active = new Map<ShortcutId, () => void>()
  for (const h of registered) {
    for (const [id, fn] of Object.entries(h) as [ShortcutId, () => void][]) active.set(id, fn)
  }
  const id = matchShortcut(e, combosSource(), new Set(active.keys()))
  if (!id) return
  e.preventDefault() // Ctrl+P would open the browser print dialog
  if (!e.repeat) active.get(id)!()
}

/** Registers handlers while the calling component is mounted. */
export function useShortcuts(handlers: ShortcutHandlers): void {
  const settings = useSettingsStore()
  onMounted(() => {
    registered.add(handlers)
    combosSource = () => effectiveCombos(settings.settings.shortcuts)
    if (!listening) {
      window.addEventListener('keydown', onKeydown)
      listening = true
    }
  })
  onBeforeUnmount(() => {
    registered.delete(handlers)
    if (registered.size === 0 && listening) {
      window.removeEventListener('keydown', onKeydown)
      listening = false
    }
  })
}

/** Current keys (defaults plus overrides) as reactive data. */
export function useCombos() {
  const { settings } = storeToRefs(useSettingsStore())
  const combos = computed(() => effectiveCombos(settings.value.shortcuts))
  /** Text for tooltips, e.g. "Ctrl+Shift+F". */
  const label = (id: ShortcutId): string => displayCombo(combos.value[id])
  return { combos, label }
}
