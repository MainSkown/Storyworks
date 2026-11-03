import { beforeEach, describe, expect, it } from 'vitest'
import { registerBuiltInExporters } from '.'
import { bookExportersFor, resetExporters, scriptExportersFor } from './registry'

describe('built-in exporters', () => {
  beforeEach(resetExporters)

  it('books get PDF and DOCX, screenplays get their own script exporters', () => {
    registerBuiltInExporters()
    expect(bookExportersFor('book').map((e) => e.id)).toEqual(['pdf', 'docx'])
    expect(scriptExportersFor('screenplay').map((e) => e.id)).toEqual(expect.arrayContaining(['pdf-script', 'docx-script', 'fountain']))
    expect(bookExportersFor('screenplay')).toEqual([])
  })
})
