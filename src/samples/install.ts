import { MANIFEST_FILE } from '../project/migrations'
import type { ProjectIO } from '../project/types'
import { sampleDir, SAMPLE_INDEX } from './build'
import { gameSampleDir } from './game/build'
import { screenplaySampleDir } from './screenplay/build'
import type { SampleLang } from './text'

export type SampleKind = 'book' | 'screenplay' | 'game'
export const SAMPLE_KINDS: readonly SampleKind[] = ['book', 'screenplay', 'game']

export const sampleDirFor = (kind: SampleKind, lang: SampleLang): string =>
  kind === 'screenplay' ? screenplaySampleDir(lang) : kind === 'game' ? gameSampleDir(lang) : sampleDir(lang)

export type SampleFetch = (url: string) => Promise<string>

/** Reads a bundled file (public/samples/…); the bundle itself is never written. */
const fetchBundled: SampleFetch = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not read ${url} (${res.status})`)
  return res.text()
}

export class SampleExistsError extends Error {
  constructor() {
    super(`${MANIFEST_FILE} already exists`)
  }
}

/** Copies the bundled sample of `kind` into the (empty or new) project folder behind `io`. Refuses to touch an existing project. */
export async function installSample(
  io: ProjectIO,
  lang: SampleLang,
  read: SampleFetch = fetchBundled,
  base = import.meta.env.BASE_URL,
  kind: SampleKind = 'book',
): Promise<void> {
  if (await io.exists(MANIFEST_FILE)) throw new SampleExistsError()
  const root = `${base}samples/${sampleDirFor(kind, lang)}/`
  const paths = JSON.parse(await read(root + SAMPLE_INDEX)) as string[]
  // Read everything first so a failed download leaves nothing behind; the manifest goes last.
  const files = await Promise.all(paths.map(async (p) => [p, await read(root + p)] as const))
  const manifest = files.filter(([p]) => p === MANIFEST_FILE)
  for (const [p, text] of [...files.filter(([p]) => p !== MANIFEST_FILE), ...manifest])
    await io.writeTextAtomic(p, text)
}
