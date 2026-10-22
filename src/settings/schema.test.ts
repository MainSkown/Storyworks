import { describe, expect, it } from 'vitest'
import { defaultSettings, settingsSchema } from './schema'

const with_ = (patch: Record<string, unknown>) => ({ ...defaultSettings, ...patch })

describe('settings schema', () => {
  it('accepts the defaults', () => {
    expect(settingsSchema.safeParse(defaultSettings).success).toBe(true)
  })
  it.each([79, 151, 100.5])('rejects uiZoom %s', (v) => {
    expect(settingsSchema.safeParse(with_({ uiZoom: v })).success).toBe(false)
  })
  it.each([80, 150])('accepts uiZoom %s', (v) => {
    expect(settingsSchema.safeParse(with_({ uiZoom: v })).success).toBe(true)
  })
  it.each([11, 33])('rejects editorFontSize %s', (v) => {
    expect(settingsSchema.safeParse(with_({ editorFontSize: v })).success).toBe(false)
  })
  it('rejects an unknown theme', () => {
    expect(settingsSchema.safeParse(with_({ theme: 'blue' })).success).toBe(false)
  })
  it('rejects a missing field', () => {
    const rest: Record<string, unknown> = { ...defaultSettings }
    delete rest.theme
    expect(settingsSchema.safeParse(rest).success).toBe(false)
  })
})
