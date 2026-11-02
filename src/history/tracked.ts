import type { ProjectIO } from '../project/types'
import type { ManifestView } from './manifestView'

/** What a snapshot may record: the manifest, every file it lists, assets and dictionaries. Never `.storyworks/`. */
export async function trackedFiles(io: ProjectIO, view: ManifestView): Promise<string[]> {
  const out = new Set<string>(['project.json'])
  for (const e of view.entries) if (e.path) out.add(e.path)
  for (const dir of [view.dirs.assets, view.dirs.dictionaries]) {
    for (const p of await io.listFiles(dir)) out.add(p)
  }
  return [...out].filter((p) => !p.startsWith('.storyworks/') && !p.startsWith('.git/'))
}
