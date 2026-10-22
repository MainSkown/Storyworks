import { describe, expect, it } from 'vitest'
import type { Env } from './types'
import { manifestSchema, createManifest } from './schemas/manifest'
import { sceneSchema } from './schemas/scene'
import { parseFile, serialize } from './serialize'

const env: Env = { now: () => 1_700_000_000_000, newId: () => 'id-1' }
const manifest = createManifest({ title: 'T', author: 'A', language: 'en' }, env)

describe('serialize', () => {
  it('pretty-prints with 2 spaces and a trailing newline', () => {
    const text = serialize(manifestSchema, manifest)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n  "version": 1')
  })
  it('key order follows the schema, whatever the input order', () => {
    const reversed = Object.fromEntries(Object.entries(manifest).reverse()) as typeof manifest
    expect(serialize(manifestSchema, reversed)).toBe(serialize(manifestSchema, manifest))
    expect(Object.keys(JSON.parse(serialize(manifestSchema, reversed)))[0]).toBe('version')
  })
  it('saving unchanged data produces identical text', () => {
    const text = serialize(manifestSchema, manifest)
    const r = parseFile(manifestSchema, text, 'project.json')
    expect(r.ok).toBe(true)
    if (r.ok) expect(serialize(manifestSchema, r.value)).toBe(text)
  })
  it('refuses to serialize an invalid value', () => {
    expect(() => serialize(manifestSchema, { ...manifest, title: 5 } as never)).toThrow()
  })
})

describe('parseFile', () => {
  it('returns the value for a valid file', () => {
    const r = parseFile(manifestSchema, serialize(manifestSchema, manifest), 'project.json')
    expect(r).toEqual({ ok: true, value: manifest })
  })
  it('invalid JSON names the file', () => {
    const r = parseFile(manifestSchema, '{ nope', 'project.json')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.file).toBe('project.json')
  })
  it('schema violation names file and field', () => {
    const text = JSON.stringify({ version: 1, id: 's1', title: 3, content: {} })
    const r = parseFile(sceneSchema, text, 'manuscript/s1.json')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.file).toBe('manuscript/s1.json')
      expect(r.error.field).toBe('title')
    }
  })
  it('rejects duplicate block ids in a file', () => {
    const b = { type: 'paragraph', attrs: { id: 'a' } }
    const text = JSON.stringify({
      version: 1,
      id: 's1',
      title: 'S',
      content: { type: 'doc', content: [b, b] },
    })
    expect(parseFile(sceneSchema, text, 's1.json').ok).toBe(false)
  })
  it('an unknown kind parses', () => {
    const text = JSON.stringify({ ...manifest, kind: 'game-x' })
    expect(parseFile(manifestSchema, text, 'project.json').ok).toBe(true)
  })
})
