import { describe, expect, it } from 'vitest'
import { viewManifest } from './manifestView'

const manifest = (stats: unknown) =>
  JSON.stringify({ version: 12, title: 'B', manuscript: [], stats, dirs: { assets: 'assets', dictionaries: 'dictionaries' } })

describe('stats.json and snapshots', () => {
  it('is not a snapshot item and its slot is not a book setting', () => {
    const a = viewManifest(manifest(null))
    const b = viewManifest(manifest({ id: 's', path: 'stats.json' }))
    expect(b?.entries.some((e) => e.path === 'stats.json')).toBe(false)
    expect(b?.settings).toBe(a?.settings)
  })
})
