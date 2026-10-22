import type { z } from 'zod'
import type { ParseResult } from './types'

/** Validates, then writes the schema output (so key order follows the schema). Throws on invalid values. */
export function serialize<T>(schema: z.ZodType<T>, value: T): string {
  return JSON.stringify(schema.parse(value), null, 2) + '\n'
}

export function parseFile<T>(schema: z.ZodType<T>, text: string, file: string): ParseResult<T> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return { ok: false, error: { file, message: `Invalid JSON: ${detail}` } }
  }
  const r = schema.safeParse(raw)
  if (r.success) return { ok: true, value: r.data }
  const issue = r.error.issues[0]
  const field = issue.path.join('.')
  return { ok: false, error: { file, ...(field ? { field } : {}), message: issue.message } }
}
