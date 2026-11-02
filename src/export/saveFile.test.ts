import { describe, expect, it } from 'vitest'
import { safeFileName } from './saveFile'

describe('safeFileName', () => {
  it('removes characters illegal in file names', () => {
    expect(safeFileName('A/B: "C"?', 'pdf')).toBe('A B C.pdf')
  })
  it('falls back for an empty title', () => {
    expect(safeFileName('  ', 'docx')).toBe('book.docx')
  })
})
