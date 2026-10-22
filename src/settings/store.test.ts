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
    const newer = JSON.stringify({ version: 3, whatever: true })
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
      'recentProjects',
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

  describe('recent projects', () => {
    const p = (n: number) => ({ path: `/p/${n}`, title: `P${n}` })

    it('adds to the front with a timestamp', async () => {
      const s = freshStore()
      await s.load()
      s.addRecentProject(p(1))
      s.addRecentProject(p(2))
      expect(s.settings.recentProjects.map((r) => r.path)).toEqual(['/p/2', '/p/1'])
      expect(Number.isNaN(Date.parse(s.settings.recentProjects[0]!.openedAt))).toBe(false)
    })

    it('re-adding moves to the front without duplicating and updates the title', async () => {
      const s = freshStore()
      await s.load()
      s.addRecentProject(p(1))
      s.addRecentProject(p(2))
      s.addRecentProject({ path: '/p/1', title: 'Renamed' })
      expect(s.settings.recentProjects.map((r) => [r.path, r.title])).toEqual([
        ['/p/1', 'Renamed'],
        ['/p/2', 'P2'],
      ])
    })

    it('keeps at most 10, dropping the oldest', async () => {
      const s = freshStore()
      await s.load()
      for (let i = 1; i <= 12; i++) s.addRecentProject(p(i))
      const paths = s.settings.recentProjects.map((r) => r.path)
      expect(paths).toHaveLength(10)
      expect(paths[0]).toBe('/p/12')
      expect(paths[9]).toBe('/p/3')
    })

    it('removes by path', async () => {
      const s = freshStore()
      await s.load()
      s.addRecentProject(p(1))
      s.addRecentProject(p(2))
      s.removeRecentProject('/p/1')
      expect(s.settings.recentProjects.map((r) => r.path)).toEqual(['/p/2'])
    })

    it('persists and reloads', async () => {
      const s = freshStore()
      await s.load()
      s.addRecentProject(p(1))
      s.addRecentProject(p(2))
      s.removeRecentProject('/p/1')
      await s.flush()
      const s2 = freshStore()
      await s2.load()
      expect(s2.settings.recentProjects.map((r) => r.path)).toEqual(['/p/2'])
    })

    it('is not changed when settings are read-only', async () => {
      const newer = JSON.stringify({ version: 3 })
      io.files.set(FILE, newer)
      const s = freshStore()
      await s.load()
      s.addRecentProject(p(1))
      await s.flush()
      expect(io.files.get(FILE)).toBe(newer)
    })
  })

  describe('migration', () => {
    const v1: Record<string, unknown> = { ...defaultSettings, version: 1, theme: 'dark' }
    delete v1.recentProjects

    it('a v1 file loads with empty recent projects and is saved as v2', async () => {
      io.files.set(FILE, JSON.stringify(v1))
      const s = freshStore()
      await s.load()
      expect(s.loadError).toBeNull()
      expect(s.settings.version).toBe(2)
      expect(s.settings.theme).toBe('dark')
      expect(s.settings.recentProjects).toEqual([])
      await s.flush()
      const saved = JSON.parse(io.files.get(FILE)!)
      expect(saved.version).toBe(2)
      expect(saved.recentProjects).toEqual([])
      expect(saved.theme).toBe('dark')
    })

    it('an invalid v1 file is rejected and left untouched', async () => {
      const bad = JSON.stringify({ ...v1, uiZoom: 79 })
      io.files.set(FILE, bad)
      const s = freshStore()
      await s.load()
      expect(s.loadError?.kind).toBe('invalid-schema')
      s.setTheme('light')
      await s.flush()
      expect(io.files.get(FILE)).toBe(bad)
    })
  })
})
