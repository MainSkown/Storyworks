// Test helper: a memory project with a hand-built manifest and a memory history engine.
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createManifest, manifestSchema, type Manifest } from '../project/schemas/manifest'
import { serialize } from '../project/serialize'
import type { Env } from '../project/types'
import { createMemoryEngine, type MemoryEngine } from './memoryEngine'

export type Node = Manifest['manuscript'][number]

export function makeEnv(): Env {
  let n = 0
  let t = Date.UTC(2026, 10, 2, 12, 0, 0)
  return { now: () => (t += 60_000), newId: () => `id-${++n}` }
}

export const sceneNode = (id: string, title = id): Node => ({
  id, type: 'scene', title, path: `manuscript/${id}.json`, children: [],
})
export const chapterNode = (id: string, title: string, children: Node[] = []): Node => ({
  id, type: 'chapter', title, children,
})

export interface Kit {
  io: MemoryProjectIO
  env: Env
  engine: MemoryEngine
  manifest: Manifest
  /** Serialises the manifest to project.json. */
  save(): Promise<void>
  scene(id: string, text: string): Promise<void>
  text(path: string): string | undefined
}

/** Chapter ch1 with scenes s1..s3, each file holding "<id>-1". */
export async function makeKit(): Promise<Kit> {
  const env = makeEnv()
  const io = createMemoryProjectIO()
  const manifest = createManifest({ title: 'Book', author: 'A', language: 'en' }, env)
  manifest.manuscript = [chapterNode('ch1', 'Chapter 1', [sceneNode('s1', 'Scene 1'), sceneNode('s2', 'Scene 2'), sceneNode('s3', 'Scene 3')])]
  const kit: Kit = {
    io, env, manifest,
    engine: createMemoryEngine(io, env),
    save: () => io.writeTextAtomic('project.json', serialize(manifestSchema, kit.manifest)),
    scene: (id, text) => io.writeTextAtomic(`manuscript/${id}.json`, text),
    text: (path) => io.files.get(path),
  }
  await kit.save()
  for (const id of ['s1', 's2', 's3']) await kit.scene(id, `${id}-1`)
  return kit
}
