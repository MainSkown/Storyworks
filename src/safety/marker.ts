// "Running" marker in app data: written at start, removed on clean exit.
import { z } from 'zod'
import type { FileIO } from '../io/fileIO'

export const MARKER_PATH = 'running.json'

const markerSchema = z.object({
  pid: z.number().int(),
  startedAt: z.number().finite(),
  lastBook: z.string().nullable(),
})
export type Marker = z.infer<typeof markerSchema>

/** null = no marker file; 'invalid' = unreadable. */
export async function readMarker(io: FileIO): Promise<Marker | null | 'invalid'> {
  const text = await io.readText(MARKER_PATH)
  if (text === null) return null
  try {
    const r = markerSchema.safeParse(JSON.parse(text))
    return r.success ? r.data : 'invalid'
  } catch {
    return 'invalid'
  }
}

export const writeMarker = (io: FileIO, m: Marker) =>
  io.writeTextAtomic(MARKER_PATH, JSON.stringify(m))

export const clearMarker = (io: FileIO) => io.remove(MARKER_PATH)
