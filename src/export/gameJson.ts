import { gameDocSchema, type GameDoc } from './gameModel'

export const serializeGameJson = (doc: GameDoc): string => JSON.stringify(doc, null, 2) + '\n'

export type ParseGameResult = { ok: true; doc: GameDoc } | { ok: false; error: string }

/** Reads game JSON back (used by tests; there is no import). Wrong format, newer version or bad shape = error. */
export function parseGameJson(text: string): ParseGameResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Not valid JSON' }
  }
  const r = gameDocSchema.safeParse(raw)
  if (r.success) return { ok: true, doc: r.data }
  const i = r.error.issues[0]
  return { ok: false, error: i ? `${i.path.join('.') || 'file'}: ${i.message}` : 'Invalid game file' }
}
