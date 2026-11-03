import { describe, expect, it } from 'vitest'
import { buildGameDoc } from './gameDoc'
import { parseGameJson, serializeGameJson } from './gameJson'
import { gameSource } from './gameTestSource'

const built = () => buildGameDoc(gameSource())

describe('game JSON', () => {
  it('stamps format and version', async () => {
    const json = JSON.parse(serializeGameJson(await built()))
    expect(json).toMatchObject({ format: 'storyworks-game', version: 1 })
  })

  it('reads back the same conversation graph and story map', async () => {
    const doc = await built()
    const r = parseGameJson(serializeGameJson(doc))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.items).toEqual(doc.items)
    expect(r.doc.storyMap).toEqual(doc.storyMap)
    expect(r.doc).toEqual(doc)
    const c = r.doc.items.find((i) => i.id === 'c1')
    expect(c?.type === 'conversation' && c.edges.length).toBe(3)
  })

  it('has every line with its id and speaker', async () => {
    const json = JSON.parse(serializeGameJson(await built())) as { items: { lines?: unknown[]; nodes?: { lines?: unknown[] }[] }[] }
    const lines = json.items.flatMap((i) => [...(i.lines ?? []), ...(i.nodes ?? []).flatMap((n) => n.lines ?? [])]) as {
      lineId: string
      speakerName: string | null
    }[]
    expect(lines.map((l) => l.lineId).sort()).toEqual(['L1', 'L10', 'L11', 'L12', 'L13', 'L2', 'L9'])
    expect(lines.find((l) => l.lineId === 'L13')?.speakerName).toBe('Anna')
  })

  it('leaves out comments, notes, trashed text and coordinates', async () => {
    const text = serializeGameJson(await built())
    expect(text).not.toMatch(/comment|cm1|notes|appendix|TRASHED/i)
    expect(text).not.toMatch(/"[xy]":/)
  })

  it('rejects a newer version', async () => {
    const o = JSON.parse(serializeGameJson(await built()))
    expect(parseGameJson(JSON.stringify({ ...o, version: 2 })).ok).toBe(false)
  })

  it('rejects a wrong format', async () => {
    const o = JSON.parse(serializeGameJson(await built()))
    expect(parseGameJson(JSON.stringify({ ...o, format: 'something-else' })).ok).toBe(false)
  })

  it('rejects malformed text and malformed content', async () => {
    expect(parseGameJson('{nope').ok).toBe(false)
    expect(parseGameJson('[]').ok).toBe(false)
    const o = JSON.parse(serializeGameJson(await built()))
    expect(parseGameJson(JSON.stringify({ ...o, items: [{ type: 'conversation', id: 'c' }] })).ok).toBe(false)
  })
})
