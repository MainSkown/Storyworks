import { describe, expect, it } from 'vitest'
import type { Env } from '../types'
import { MANIFEST_VERSION, createManifest, manifestSchema } from './manifest'

const env: Env = { now: () => 1_700_000_000_000, newId: () => 'id-1' }
const meta = { title: 'My Book', author: 'Ann', language: 'en' }

describe('manifest schema', () => {
  it('current version is 2', () => {
    expect(MANIFEST_VERSION).toBe(2)
  })
  it('a new manifest is valid and carries the meta', () => {
    const m = createManifest(meta, env)
    expect(manifestSchema.safeParse(m).success).toBe(true)
    expect(m.version).toBe(MANIFEST_VERSION)
    expect(m.kind).toBe('book')
    expect(m.title).toBe('My Book')
    expect(m.author).toBe('Ann')
    expect(m.language).toBe('en')
  })
  it('a new manifest starts with an empty trash', () => {
    expect(createManifest(meta, env).trash).toEqual([])
  })
  it('an unknown kind string still parses', () => {
    const m = { ...createManifest(meta, env), kind: 'game-x' }
    const r = manifestSchema.safeParse(m)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.kind).toBe('game-x')
  })
  it('rejects a title that is not a string', () => {
    const r = manifestSchema.safeParse({ ...createManifest(meta, env), title: 5 })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].path).toEqual(['title'])
  })
  it('rejects a missing version', () => {
    const rest: Record<string, unknown> = { ...createManifest(meta, env) }
    delete rest.version
    expect(manifestSchema.safeParse(rest).success).toBe(false)
  })
  it('rejects a manuscript node with an unknown type', () => {
    const m = createManifest(meta, env)
    const bad = { ...m, manuscript: [{ id: 'x', type: 'volume', title: 'X', children: [] }] }
    expect(manifestSchema.safeParse(bad).success).toBe(false)
  })
})
