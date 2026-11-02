import { beforeEach, describe, expect, it } from 'vitest'
import {
  exportersFor,
  getExporter,
  registerExporter,
  resetExporters,
  type Exporter,
} from './registry'

const fake = (id: string, kinds: string[]): Exporter => ({
  id,
  labelKey: `export.format.${id}`,
  extension: 'bin',
  mime: 'application/octet-stream',
  kinds,
  export: async () => new Uint8Array(),
})

describe('exporter registry', () => {
  beforeEach(resetExporters)

  it('lists a registered exporter for its kind', () => {
    registerExporter(fake('a', ['book']))
    expect(exportersFor('book').map((e) => e.id)).toEqual(['a'])
  })

  it('does not list it for another kind', () => {
    registerExporter(fake('a', ['book']))
    expect(exportersFor('screenplay')).toEqual([])
  })

  it('finds an exporter by id', () => {
    registerExporter(fake('a', ['book']))
    expect(getExporter('a')?.id).toBe('a')
    expect(getExporter('zzz')).toBeUndefined()
  })

  it('reset empties the registry', () => {
    registerExporter(fake('a', ['book']))
    resetExporters()
    expect(exportersFor('book')).toEqual([])
  })
})
