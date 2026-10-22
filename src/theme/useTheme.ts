import { Dark } from 'quasar'
import { onScopeDispose, watchEffect, type Ref } from 'vue'
import { resolveTheme, type ThemeSetting } from './resolveTheme'

export interface ThemeOptions {
  theme: Ref<ThemeSetting>
  /** Percent, 100 = normal. */
  uiZoom: Ref<number>
  /** Pixels. */
  editorFontSize: Ref<number>
}

export function useTheme({ theme, uiZoom, editorFontSize }: ThemeOptions): void {
  const root = document.documentElement
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  let systemDark = media.matches
  const apply = () => {
    const resolved = resolveTheme(theme.value, systemDark)
    root.dataset.theme = resolved
    Dark.set(resolved === 'dark')
  }
  const onChange = (e: MediaQueryListEvent) => {
    systemDark = e.matches
    apply()
  }
  media.addEventListener('change', onChange)
  onScopeDispose(() => media.removeEventListener('change', onChange))

  watchEffect(apply)
  watchEffect(() => {
    root.style.setProperty('--ui-zoom', String(uiZoom.value / 100))
    root.style.setProperty('--editor-font-size', `${editorFontSize.value}px`)
  })
}
