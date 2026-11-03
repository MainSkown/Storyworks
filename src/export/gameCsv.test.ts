import { describe, expect, it } from 'vitest'
import { buildGameDoc } from './gameDoc'
import { csvField, toGameCsv } from './gameCsv'
import { gameCsvExporter } from './gameExporters'
import { gameSource } from './gameTestSource'

describe('csvField', () => {
  it('leaves plain text alone', () => expect(csvField('hello world')).toBe('hello world'))
  it('quotes commas', () => expect(csvField('a,b')).toBe('"a,b"'))
  it('doubles quotes', () => expect(csvField('say "hi"')).toBe('"say ""hi"""'))
  it('quotes newlines', () => {
    expect(csvField('a\nb')).toBe('"a\nb"')
    expect(csvField('a\r\nb')).toBe('"a\r\nb"')
  })
})

describe('toGameCsv', () => {
  it('starts with a BOM and the header', async () => {
    const csv = toGameCsv(await buildGameDoc(gameSource()))
    expect(csv.startsWith('﻿item,node,line_id,speaker,text\r\n')).toBe(true)
  })

  it('has one row per line with item, node, id, speaker and text', async () => {
    const rows = toGameCsv(await buildGameDoc(gameSource())).replace('﻿', '').split('\r\n')
    expect(rows).toContain('Intro,,L10,,From a deleted entry')
    expect(rows).toContain('Intro,,L11,,"No speaker, with, commas"')
    expect(rows).toContain('Intro,,L12,,A description')
    expect(rows).toContain('Intro,,L13,Anna,Named')
    expect(rows).toContain('Talk,n1,L1,Anna,"Hello, ""friend"""')
    expect(rows).toContain('Other,m1,L9,,Hi')
  })

  it('keeps a multi-line text inside one quoted field', async () => {
    const csv = toGameCsv(await buildGameDoc(gameSource()))
    expect(csv).toContain('Talk,n1,L2,Narrator,"Line one\nline two"\r\n')
  })

  it('has no rows for folders, trashed items or choice options', async () => {
    const csv = toGameCsv(await buildGameDoc(gameSource()))
    expect(csv).not.toMatch(/Act 1|TRASHED|Yes/)
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1 + 7)
  })
})

describe('CSV exporter', () => {
  it('writes UTF-8 bytes with a BOM', async () => {
    const out = await gameCsvExporter.export(await buildGameDoc(gameSource()))
    expect([...out.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  })
})
