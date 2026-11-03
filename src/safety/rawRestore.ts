// Restore from the latest automatic backup when project.json itself is unreadable.
// Needs no valid manifest: it copies the backup's files over the book and keeps the old state aside first.
import { listBackups, makeBackup } from '../history/backups'
import { MANIFEST_VERSION, manifestSchema, peekManifestHeader } from '../project/schemas/manifest'
import { parseFile } from '../project/serialize'
import type { Env, ProjectIO } from '../project/types'

export type RawRestoreCode = 'no-backup' | 'backup-invalid' | 'failed'

export class RawRestoreError extends Error {
  readonly code: RawRestoreCode
  constructor(code: RawRestoreCode, message: string) {
    super(message)
    this.name = 'RawRestoreError'
    this.code = code
  }
}

export interface RawRestoreResult {
  backup: string
  /** Backup folder holding the files as they were before the restore. */
  safetyCopy: string
  written: number
}

const MANIFEST = 'project.json'
const BACKUPS = '.storyworks/backups'

export async function findLatestAutoBackup(io: ProjectIO) {
  return (await listBackups(io).catch(() => [])).find((b) => b.kind === 'auto') ?? null
}

/** An older format is fine (opening migrates it); a broken or same-format-but-invalid manifest is not. */
function usableManifest(text: string | null): boolean {
  if (text === null) return false
  const header = peekManifestHeader(text)
  if (!header || header.version === null) return false
  return header.version !== MANIFEST_VERSION || parseFile(manifestSchema, text, MANIFEST).ok
}

/** Files that are not JSON (images, dictionaries) are copied as bytes. */
async function copyOne(io: ProjectIO, from: string, to: string): Promise<void> {
  if (from.endsWith('.json')) {
    await io.writeTextAtomic(to, (await io.readText(from)) ?? '')
    return
  }
  const bytes = await io.readBytes(from)
  if (bytes) await io.writeBytes(to, bytes)
}

export async function restoreLatestBackupRaw(io: ProjectIO, env: Env): Promise<RawRestoreResult> {
  const backup = await findLatestAutoBackup(io)
  if (!backup) throw new RawRestoreError('no-backup', 'This book has no automatic backup.')
  const dir = `${BACKUPS}/${backup.name}`
  if (!usableManifest(await io.readText(`${dir}/${MANIFEST}`))) {
    throw new RawRestoreError('backup-invalid', 'The latest backup has no usable project.json.')
  }
  const prefix = `${dir}/`
  const files = (await io.listFiles(dir)).map((p) => p.slice(prefix.length)).sort()
  // The manifest goes last: if anything fails, the book stays as broken as before and the restore can be retried.
  const ordered = [...files.filter((p) => p !== MANIFEST), MANIFEST]

  const safetyCopy = await makeBackup(io, env, 'safety')
  let written = 0
  try {
    for (const p of ordered) {
      await copyOne(io, `${prefix}${p}`, p)
      written++
    }
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    throw new RawRestoreError('failed', `Restore stopped (${why}). Your earlier files are in "${safetyCopy}".`)
  }
  return { backup: backup.name, safetyCopy, written }
}

/** Readable text for a RawRestoreError; null for any other error. */
export function describeRawError(e: unknown, t: (key: string) => string, te: (key: string) => boolean): string | null {
  if (!(e instanceof RawRestoreError)) return null
  const key = `safety.rawRestore.${e.code}`
  const base = te(key) ? t(key) : t('history.error.generic')
  return e.code === 'failed' ? `${base} ${e.message}` : base
}
