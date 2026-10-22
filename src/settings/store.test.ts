import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryFileIO, type MemoryFileIO } from '../io/fileIO'
import { defaultSettings } from './schema'
import { resetFileIOFactory, setFileIOFactory, useSettingsStore } from './store'

const FILE = 'settings.json'
let io: MemoryFileIO

function freshStore() {
  setActivePinia(createPinia())
  return useSettingsStore()
}

beforeEach(() => {
  io = createMemoryFileIO()
  setFileIOFactory(() => io)
})
afterEach(() => {
  resetFileIOFactory()
  vi.useRealTimers()
})

describe('settings store', () => {
  it('uses defaults when there is no file', async () => {
    const s = freshStore()
    await s.load('en-US')
    expect(s.settings).toEqual(defaultSettings)
    expect(s.loadError).toBeNull()
    expect(s.loaded).toBe(true)
  })

  it('first run takes the language from the system locale', async () => {
    const s = freshStore()
    await s.load('pl-PL')
    expect(s.settings.language).toBe('pl')
  })

  it('an existing file keeps its language over the system locale', async () => {
    io.files.set(FILE, JSON.stringify({ ...defaultSettings, language: 'en' }))
    const s = freshStore()
    await s.load('pl-PL')
    expect(s.settings.language).toBe('en')
  })

  it('loads a valid file', async () => {
    io.files.set(FILE, JSON.stringify({ ...defaultSettings, theme: 'dark', uiZoom: 120 }))
    const s = freshStore()
    await s.load()
    expect(s.settings.theme).toBe('dark')
    expect(s.settings.uiZoom).toBe(120)
  })

  it('malformed JSON: defaults, error set, file untouched after a change', async () => {
    io.files.set(FILE, '{ not json')
    const s = freshStore()
    await s.load()
    expect(s.loadError?.kind).toBe('invalid-json')
    expect(s.settings).toEqual(defaultSettings)
    s.setTheme('dark')
    await s.flush()
    expect(io.files.get(FILE)).toBe('{ not json')
  })

  it('schema violation names the field and leaves the file untouched', async () => {
    const bad = JSON.stringify({ ...defaultSettings, uiZoom: 79 })
    io.files.set(FILE, bad)
    const s = freshStore()
    await s.load()
    expect(s.loadError?.kind).toBe('invalid-schema')
    expect(s.loadError?.field).toBe('uiZoom')
    s.setLanguage('pl')
    await s.flush()
    expect(io.files.get(FILE)).toBe(bad)
  })

  it('font size out of range is rejected', async () => {
    io.files.set(FILE, JSON.stringify({ ...defaultSettings, editorFontSize: 40 }))
    const s = freshStore()
    await s.load()
    expect(s.loadError?.field).toBe('editorFontSize')
  })

  it('zoom 151 is rejected', async () => {
    io.files.set(FILE, JSON.stringify({ ...defaultSettings, uiZoom: 151 }))
    const s = freshStore()
    await s.load()
    expect(s.loadError?.field).toBe('uiZoom')
  })

  it('newer version is read-only and left untouched', async () => {
    const newer = JSON.stringify({ version: 2, whatever: true })
    io.files.set(FILE, newer)
    const s = freshStore()
    await s.load()
    expect(s.readOnly).toBe(true)
    expect(s.loadError?.kind).toBe('newer-version')
    s.setTheme('light')
    await s.flush()
    expect(io.files.get(FILE)).toBe(newer)
  })

  it('a change persists and reloads in a fresh store', async () => {
    const s = freshStore()
    await s.load()
    s.setTheme('dark')
    s.setLanguage('pl')
    s.setUiZoom(125)
    s.setEditorFontSize(22)
    s.setContextPanelHidden(true)
    await s.flush()
    const s2 = freshStore()
    await s2.load()
    expect(s2.settings).toEqual({
      ...defaultSettings,
      theme: 'dark',
      language: 'pl',
      uiZoom: 125,
      editorFontSize: 22,
      contextPanel: { hidden: true, collapsed: {} },
    })
  })

  it('section toggle persists', async () => {
    const s = freshStore()
    await s.load()
    expect(s.isCollapsed('notes')).toBe(false)
    s.toggleSection('notes')
    await s.flush()
    const s2 = freshStore()
    await s2.load()
    expect(s2.isCollapsed('notes')).toBe(true)
  })

  it('writes are debounced by 300 ms', async () => {
    vi.useFakeTimers()
    const s = freshStore()
    await s.load()
    s.setTheme('dark')
    await vi.advanceTimersByTimeAsync(299)
    expect(io.files.has(FILE)).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(io.files.has(FILE)).toBe(true)
  })

  it('file is pretty-printed with stable key order and trailing newline', async () => {
    const s = freshStore()
    await s.load()
    s.toggleSection('b')
    s.toggleSection('a')
    await s.flush()
    const text = io.files.get(FILE)!
    expect(text.endsWith('}\n')).toBe(true)
    expect(Object.keys(JSON.parse(text))).toEqual([
      'version',
      'theme',
      'language',
      'uiZoom',
      'editorFontSize',
      'contextPanel',
    ])
    expect(Object.keys(JSON.parse(text).contextPanel.collapsed)).toEqual(['a', 'b'])
    expect(text).toContain('\n  "theme"')
  })

  it('an out-of-range setter is rejected and nothing is written', async () => {
    const s = freshStore()
    await s.load()
    s.setUiZoom(200)
    await s.flush()
    expect(s.settings.uiZoom).toBe(100)
    expect(io.files.has(FILE)).toBe(false)
  })
})
