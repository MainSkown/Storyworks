import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createFileIO, type FileIO } from '../io/fileIO'
import {
  defaultSettings,
  MAX_RECENT_PROJECTS,
  SETTINGS_VERSION,
  settingsSchema,
  type Language,
  type Settings,
  type Theme,
} from './schema'
import { migrateSettings } from './migrate'
import { resolveLanguage } from '../i18n/resolveLanguage'

export const SETTINGS_FILE = 'settings.json'
const SAVE_DELAY_MS = 300

let fileIOFactory: () => FileIO = createFileIO
export function setFileIOFactory(factory: () => FileIO): void {
  fileIOFactory = factory
}
export function resetFileIOFactory(): void {
  fileIOFactory = createFileIO
}

export interface SettingsLoadError {
  kind: 'invalid-json' | 'invalid-schema' | 'newer-version'
  /** Dotted path of the first failing field, when known. */
  field?: string
  message: string
}

function cloneDefaults(): Settings {
  return structuredClone(defaultSettings)
}

/** Fixed key order so the file diffs cleanly. */
function serialize(s: Settings): string {
  const collapsed = Object.fromEntries(
    Object.entries(s.contextPanel.collapsed).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )
  const ordered: Settings = {
    version: s.version,
    theme: s.theme,
    language: s.language,
    uiZoom: s.uiZoom,
    editorFontSize: s.editorFontSize,
    contextPanel: { hidden: s.contextPanel.hidden, collapsed },
    recentProjects: s.recentProjects.map((r) => ({
      path: r.path,
      title: r.title,
      openedAt: r.openedAt,
    })),
  }
  return JSON.stringify(settingsSchema.parse(ordered), null, 2) + '\n'
}

export const useSettingsStore = defineStore('settings', () => {
  const io = fileIOFactory()
  const settings = ref<Settings>(cloneDefaults())
  const loaded = ref(false)
  const loadError = ref<SettingsLoadError | null>(null)
  const saveError = ref<string | null>(null)

  const readOnly = computed(() => loadError.value?.kind === 'newer-version')
  const savingDisabled = computed(() => loadError.value !== null)

  /** `systemLocale` picks the language on first run (no settings file). */
  async function load(
    systemLocale = typeof navigator === 'undefined' ? 'en' : navigator.language,
  ): Promise<void> {
    loadError.value = null
    let migratedOnLoad = false
    settings.value = cloneDefaults()
    const text = await io.readText(SETTINGS_FILE)
    if (text === null) {
      settings.value.language = resolveLanguage(systemLocale)
    } else {
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch (e) {
        loadError.value = { kind: 'invalid-json', message: (e as Error).message }
      }
      if (!loadError.value) {
        const version = (raw as { version?: unknown } | null)?.version
        if (typeof version === 'number' && version > SETTINGS_VERSION) {
          loadError.value = {
            kind: 'newer-version',
            field: 'version',
            message: `settings.json version ${version} is newer than supported (${SETTINGS_VERSION})`,
          }
        } else {
          const migrated = migrateSettings(raw)
          const result = settingsSchema.safeParse(migrated)
          if (result.success) {
            settings.value = result.data
            if (migrated !== raw) migratedOnLoad = true
          } else {
            const issue = result.error.issues[0]!
            loadError.value = {
              kind: 'invalid-schema',
              field: issue.path.join('.') || undefined,
              message: issue.message,
            }
          }
        }
      }
    }
    loaded.value = true
    if (migratedOnLoad) scheduleSave()
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  let writing: Promise<void> = Promise.resolve()
  let dirty = false

  function scheduleSave(): void {
    if (savingDisabled.value) return
    dirty = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  /** Writes any pending change now. */
  function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (savingDisabled.value || !dirty) return writing
    dirty = false
    const snapshot = settings.value
    writing = writing.then(async () => {
      try {
        await io.writeTextAtomic(SETTINGS_FILE, serialize(snapshot))
        saveError.value = null
      } catch (e) {
        saveError.value = (e as Error).message
      }
    })
    return writing
  }

  /** Applies a change only if the result is valid. */
  function update(patch: (draft: Settings) => void): void {
    const draft: Settings = JSON.parse(JSON.stringify(settings.value))
    patch(draft)
    const result = settingsSchema.safeParse(draft)
    if (!result.success) return
    settings.value = result.data
    scheduleSave()
  }

  return {
    settings,
    loaded,
    loadError,
    saveError,
    readOnly,
    savingDisabled,
    load,
    flush,
    setTheme: (v: Theme) => update((d) => void (d.theme = v)),
    setLanguage: (v: Language) => update((d) => void (d.language = v)),
    setUiZoom: (v: number) => update((d) => void (d.uiZoom = v)),
    setEditorFontSize: (v: number) => update((d) => void (d.editorFontSize = v)),
    setContextPanelHidden: (v: boolean) => update((d) => void (d.contextPanel.hidden = v)),
    toggleSection: (id: string) =>
      update((d) => void (d.contextPanel.collapsed[id] = !d.contextPanel.collapsed[id])),
    addRecentProject: (p: { path: string; title: string }) =>
      update((d) => {
        const entry = { path: p.path, title: p.title, openedAt: new Date().toISOString() }
        d.recentProjects = [entry, ...d.recentProjects.filter((r) => r.path !== p.path)].slice(
          0,
          MAX_RECENT_PROJECTS,
        )
      }),
    removeRecentProject: (path: string) =>
      update((d) => void (d.recentProjects = d.recentProjects.filter((r) => r.path !== path))),
    isCollapsed: (id: string) => settings.value.contextPanel.collapsed[id] === true,
  }
})
