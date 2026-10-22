export type ThemeSetting = 'light' | 'dark' | 'system'

export function resolveTheme(setting: ThemeSetting, systemPrefersDark: boolean): 'light' | 'dark' {
  if (setting === 'system') return systemPrefersDark ? 'dark' : 'light'
  return setting
}
