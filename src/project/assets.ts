import type { ProjectIO } from './types'

/** Copies image bytes to assets/<newId>.<ext>; returns the relative path. */
export async function addImage(
  io: ProjectIO,
  bytes: Uint8Array,
  ext: string,
  newId: () => string,
): Promise<string> {
  const clean = ext.replace(/^\./, '').toLowerCase()
  if (!/^[a-z0-9]+$/.test(clean)) throw new Error(`invalid image extension: ${JSON.stringify(ext)}`)
  const path = `assets/${newId()}.${clean}`
  await io.writeBytes(path, bytes)
  return path
}
