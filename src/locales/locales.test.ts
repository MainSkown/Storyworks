import { describe, expect, it } from 'vitest'
import en from './en.json'
import pl from './pl.json'

type Messages = Record<string, unknown>

function flatten(obj: Messages, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null) {
      Object.assign(out, flatten(value as Messages, path))
    } else {
      out[path] = String(value)
    }
  }
  return out
}

describe('locale files', () => {
  it('have identical key sets', () => {
    expect(Object.keys(flatten(pl)).sort()).toEqual(Object.keys(flatten(en)).sort())
  })

  it('have no empty values', () => {
    for (const messages of [en, pl]) {
      for (const [key, value] of Object.entries(flatten(messages))) {
        expect(value.trim(), key).not.toBe('')
      }
    }
  })
})
