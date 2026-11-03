import { z } from 'zod'

export const GAME_OVERVIEW_VERSION = 1
export const GAME_OVERVIEW_FILE = 'game-doc/overview.json'

export const gameOverviewSchema = z.strictObject({
  version: z.literal(GAME_OVERVIEW_VERSION),
  content: z.record(z.string(), z.unknown()).default({ type: 'doc', content: [] }),
})

export type GameOverview = z.infer<typeof gameOverviewSchema>
