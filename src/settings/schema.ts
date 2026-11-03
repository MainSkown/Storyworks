import { z } from 'zod'

export const SETTINGS_VERSION = 5
export const MAX_RECENT_PROJECTS = 10

export const backupSettingsSchema = z.strictObject({
  /** Minutes between automatic backups while a book is open; 0 = off. */
  intervalMinutes: z.number().int().min(0).max(1440),
  /** How many automatic backups to keep. */
  keep: z.number().int().min(1).max(200),
  onClose: z.boolean(),
})
export type BackupSettings = z.infer<typeof backupSettingsSchema>

export const settingsSchema = z.strictObject({
  version: z.literal(SETTINGS_VERSION),
  theme: z.enum(['light', 'dark', 'system']),
  language: z.enum(['en', 'pl']),
  uiZoom: z.number().int().min(80).max(150),
  editorFontSize: z.number().int().min(12).max(32),
  contextPanel: z.strictObject({
    hidden: z.boolean(),
    collapsed: z.record(z.string(), z.boolean()),
  }),
  recentProjects: z
    .array(z.strictObject({ path: z.string(), title: z.string(), openedAt: z.string() }))
    .max(MAX_RECENT_PROJECTS),
  backups: backupSettingsSchema,
  /** Rebound app shortcuts: action id -> combo (e.g. "Mod+K"). Missing = default. */
  shortcuts: z.record(z.string(), z.string().max(40)),
  /** The first-run tour was finished or skipped. */
  tourSeen: z.boolean(),
})

export type Settings = z.infer<typeof settingsSchema>
export type Theme = Settings['theme']
export type Language = Settings['language']

export const defaultSettings: Settings = {
  version: SETTINGS_VERSION,
  theme: 'system',
  language: 'en',
  uiZoom: 100,
  editorFontSize: 18,
  contextPanel: { hidden: false, collapsed: {} },
  recentProjects: [],
  backups: { intervalMinutes: 30, keep: 20, onClose: true },
  shortcuts: {},
  tourSeen: false,
}
