import { describe, expect, it } from 'vitest'
import { decodeUtf8 } from './decode'

const enc = (s: string) => new TextEncoder().encode(s)

describe('decodeUtf8', () => {
  it('decodes plain UTF-8', () => {
    expect(decodeUtf8('a.md', enc('Zażółć'))).toEqual({ ok: true, text: 'Zażółć' })
  })

  it('strips a BOM and normalizes line endings', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('a\r\nb\rc')])
    expect(decodeUtf8('a.md', bytes)).toEqual({ ok: true, text: 'a\nb\nc' })
  })

  it('rejects invalid UTF-8 and names the file', () => {
    const r = decodeUtf8('bad.txt', new Uint8Array([0x61, 0xff, 0xfe]))
    expect(r).toEqual({ ok: false, error: { file: 'bad.txt', code: 'invalid-utf8' } })
  })
})
