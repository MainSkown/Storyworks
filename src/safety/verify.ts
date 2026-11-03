// Read-only check of every book file against its schema. Never writes, never repairs.
import { listBackups, type BackupInfo } from '../history/backups'
import { listedItems, isParsed, parseItem } from '../project/open'
import { MANIFEST_VERSION, manifestSchema, peekManifestHeader } from '../project/schemas/manifest'
import { parseFile } from '../project/serialize'
import type { ProjectIO } from '../project/types'

export interface InvalidFile {
  path: string
  reason: 'missing' | 'invalid'
}

export interface VerifyReport {
  ok: boolean
  invalid: InvalidFile[]
  /** Newest automatic backup, if the book has one. */
  latestBackup: BackupInfo | null
}

const MANIFEST = 'project.json'

export async function verifyBook(io: ProjectIO): Promise<VerifyReport> {
  const invalid: InvalidFile[] = []
  const text = await io.readText(MANIFEST)
  const header = text === null ? null : peekManifestHeader(text)
  const parsed = text === null ? null : parseFile(manifestSchema, text, MANIFEST)
  if (text === null) invalid.push({ path: MANIFEST, reason: 'missing' })
  // An older or newer format is not damage: opening the book migrates it or makes it read-only.
  else if (header && header.version !== null && header.version !== MANIFEST_VERSION) {
    /* skip */
  } else if (!parsed?.ok) invalid.push({ path: MANIFEST, reason: 'invalid' })
  else {
    for (const item of listedItems(parsed.value)) {
      const body = await io.readText(item.path)
      if (body === null) invalid.push({ path: item.path, reason: 'missing' })
      else if (isParsed(item) && !parseItem(item, body).ok) {
        invalid.push({ path: item.path, reason: 'invalid' })
      }
    }
  }
  const latestBackup = (await listBackups(io).catch(() => [])).find((b) => b.kind === 'auto') ?? null
  return { ok: invalid.length === 0, invalid, latestBackup }
}
