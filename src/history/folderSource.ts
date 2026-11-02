import type { ProjectIO } from '../project/types'
import type { SnapshotSource } from './restore'

const enc = new TextEncoder()

/** Reads a copied project folder (an automatic backup) as if it were a snapshot; the id argument is ignored. */
export function folderSource(io: ProjectIO, dir: string): SnapshotSource {
  const prefix = `${dir.replace(/\/$/, '')}/`
  return {
    async listTree() {
      return (await io.listFiles(dir)).filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)).sort()
    },
    async readFile(_id, path) {
      // Memory and browser stores keep every file as text, so read text here too.
      const text = await io.readText(`${prefix}${path}`)
      return text === null ? null : enc.encode(text)
    },
  }
}
