import { z } from 'zod'

export const SETTINGS_VERSION = 2
export const MAX_RECENT_PROJECTS = 10

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
}
