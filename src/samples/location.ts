import type { SampleKind } from './install'

/** First free folder name: sample-book, sample-book-2, … (free = no project.json in it). */
export async function freeSampleName(
  isTaken: (name: string) => Promise<boolean>,
  kind: SampleKind = 'book',
): Promise<string> {
  const base = `sample-${kind}`
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`
    if (!(await isTaken(name))) return name
  }
}

/** Where a new sample copy goes: `<app data>/samples/<free name>` in the app, a virtual folder in the browser. */
export async function newSampleRoot(
  tauri: boolean,
  browserNames: () => string[],
  existsAt: (root: string) => Promise<boolean>,
  kind: SampleKind = 'book',
): Promise<string> {
  if (!tauri) {
    const taken = new Set(browserNames())
    return freeSampleName(async (n) => taken.has(n), kind)
  }
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  const dir = await join(await appDataDir(), 'samples')
  const name = await freeSampleName(async (n) => existsAt(await join(dir, n)), kind)
  return join(dir, name)
}

