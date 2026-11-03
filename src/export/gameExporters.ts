import { toGameCsv } from './gameCsv'
import { serializeGameJson } from './gameJson'
import type { GameExporter } from './registry'

const bytes = (s: string) => new TextEncoder().encode(s)

export const gameJsonExporter: GameExporter = {
  id: 'game-json',
  labelKey: 'export.formats.gameJson',
  extension: 'json',
  mime: 'application/json',
  kinds: ['game'],
  model: 'game',
  export: async (doc) => bytes(serializeGameJson(doc)),
}

export const gameCsvExporter: GameExporter = {
  id: 'game-csv',
  labelKey: 'export.formats.gameCsv',
  extension: 'csv',
  mime: 'text/csv',
  kinds: ['game'],
  model: 'game',
  export: async (doc) => bytes(toGameCsv(doc)),
}
