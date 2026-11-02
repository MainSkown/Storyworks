import type { Env, ProjectIO } from '../project/types'
import type { BackupSettings } from '../settings/schema'

const INTERNAL_DIR = '.storyworks'
const BACKUPS = `${INTERNAL_DIR}/backups`
const SIGNATURE_FILE = `${BACKUPS}/last-auto.sig`

export type BackupKind = 'auto' | 'safety' | 'pre-migration'

export interface BackupInfo {
  name: string
  kind: BackupKind
  /** ISO timestamp taken from the folder name */
  time: string
}

const stampOf = (env: Env) => new Date(env.now()).toISOString().replace(/[:.]/g, '-')

/** Copies the whole project (except .storyworks/) into .storyworks/backups/<kind>-<stamp>/. Returns the folder name. */
export async function makeBackup(io: ProjectIO, env: Env, kind: 'auto' | 'safety'): Promise<string> {
  const name = `${kind}-${stampOf(env)}`
  const dir = `${BACKUPS}/${name}`
  const files = (await io.listFiles('')).filter((p) => !p.startsWith(`${INTERNAL_DIR}/`))
  const dirs = new Set<string>()
  try {
    for (const path of files) {
      const slash = path.indexOf('/')
      if (slash === -1) await io.writeTextAtomic(`${dir}/${path}`, (await io.readText(path)) ?? '')
      else dirs.add(path.slice(0, slash))
    }
    for (const d of dirs) await io.copyTree(d, `${dir}/${d}`)
  } catch (e) {
    await io.remove(dir).catch(() => {}) // never leave a half backup that looks complete
    throw e
  }
  return name
}

const NAME = /^(auto|safety|pre-migration-v\d+)-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/

/** All backup folders, newest first. */
export async function listBackups(io: ProjectIO): Promise<BackupInfo[]> {
  const names = new Set<string>()
  for (const path of await io.listFiles(BACKUPS)) names.add(path.slice(BACKUPS.length + 1).split('/')[0])
  const out: BackupInfo[] = []
  for (const name of names) {
    const m = NAME.exec(name)
    if (!m) continue
    const kind: BackupKind = m[1].startsWith('pre-migration') ? 'pre-migration' : (m[1] as 'auto' | 'safety')
    out.push({ name, kind, time: `${m[2]}T${m[3]}:${m[4]}:${m[5]}.${m[6]}Z` })
  }
  return out.sort((a, b) => (a.time === b.time ? b.name.localeCompare(a.name) : b.time.localeCompare(a.time)))
}

/** Deletes the oldest automatic and safety backups beyond the limits. Pre-migration backups are never touched. */
export async function pruneBackups(io: ProjectIO, limits: { keepAuto: number; keepSafety?: number }): Promise<void> {
  const keep = { auto: limits.keepAuto, safety: limits.keepSafety ?? 5 }
  const seen = { auto: 0, safety: 0 }
  for (const b of await listBackups(io)) {
    if (b.kind === 'pre-migration') continue
    if (++seen[b.kind] > keep[b.kind]) await io.remove(`${BACKUPS}/${b.name}`)
  }
}

/** Fingerprint of the project's files outside .storyworks/ (paths + modification times). */
async function signature(io: ProjectIO): Promise<string> {
  const files = (await io.listFiles('')).filter((p) => !p.startsWith(`${INTERNAL_DIR}/`)).sort()
  let h = 0x811c9dc5 // FNV-1a
  for (const p of files) {
    const part = `${p}:${(await io.stat(p))?.mtimeMs ?? 0}\n`
    for (let i = 0; i < part.length; i++) h = Math.imul(h ^ part.charCodeAt(i), 0x01000193)
  }
  return `${files.length}-${(h >>> 0).toString(16)}`
}

/** Makes an automatic backup unless nothing changed since the last one. Returns its name, or null when skipped. */
export async function makeBackupIfChanged(io: ProjectIO, env: Env): Promise<string | null> {
  const sig = await signature(io)
  if ((await io.readText(SIGNATURE_FILE)) === sig) return null
  const name = await makeBackup(io, env, 'auto')
  await io.writeTextAtomic(SIGNATURE_FILE, sig)
  return name
}

export interface BackupScheduler {
  /** Backs up now if "on close" is enabled and something changed. */
  runOnClose(): Promise<void>
  stop(): void
}

/** Ticks every minute; settings are re-read each tick so changes apply without a restart. */
export function startBackupScheduler(args: {
  io: ProjectIO
  env: Env
  getSettings: () => BackupSettings
  onError?: (e: unknown) => void
}): BackupScheduler {
  const { io, env, getSettings } = args
  const onError = args.onError ?? ((e: unknown) => console.error('Backup failed', e))
  let busy: Promise<void> = Promise.resolve()

  const run = (): Promise<void> => {
    busy = busy.then(async () => {
      try {
        if (await makeBackupIfChanged(io, env)) await pruneBackups(io, { keepAuto: getSettings().keep })
      } catch (e) {
        onError(e)
      }
    })
    return busy
  }

  let elapsed = 0
  let minutes = getSettings().intervalMinutes
  const timer = setInterval(() => {
    const wanted = getSettings().intervalMinutes
    if (wanted !== minutes) {
      minutes = wanted
      elapsed = 0
    }
    if (wanted > 0 && ++elapsed >= wanted) {
      elapsed = 0
      void run()
    }
  }, 60_000)

  return {
    async runOnClose() {
      if (getSettings().onClose) await run()
      else await busy
    },
    stop() {
      clearInterval(timer)
    },
  }
}
