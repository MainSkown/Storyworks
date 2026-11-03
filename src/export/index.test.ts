import { beforeEach, describe, expect, it } from 'vitest'
import { registerBuiltInExporters } from '.'
import { bookExportersFor, exportersFor, gameExportersFor, resetExporters, scriptExportersFor } from './registry'

describe('built-in exporters', () => {
  beforeEach(resetExporters)

  it('books get PDF and DOCX, screenplays get their own script exporters', () => {
    registerBuiltInExporters()
    expect(bookExportersFor('book').map((e) => e.id)).toEqual(['pdf', 'docx'])
    expect(exportersFor('book').map((e) => e.id)).not.toContain('markdown')
    expect(scriptExportersFor('screenplay').map((e) => e.id)).toEqual(expect.arrayContaining(['pdf-script', 'docx-script', 'fountain']))
    expect(bookExportersFor('screenplay')).toEqual([])
  })

  it('games get JSON and CSV data exporters and PDF, DOCX, Markdown for the document', () => {
    registerBuiltInExporters()
    expect(gameExportersFor('game').map((e) => [e.id, e.extension])).toEqual([['game-json', 'json'], ['game-csv', 'csv']])
    expect(bookExportersFor('game').map((e) => [e.id, e.extension])).toEqual([['pdf', 'pdf'], ['docx', 'docx'], ['markdown', 'md']])
    expect(scriptExportersFor('game')).toEqual([])
    expect(gameExportersFor('book')).toEqual([])
  })
})
