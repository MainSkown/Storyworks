import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createChangeWatcher } from './changeWatcher'
import { createMemoryProjectIO } from './io/memory'
import type { ChangeEvent } from './types'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const SCENE = 'manuscript/one.json'

function setup(dirty: boolean) {
  const io = createMemoryProjectIO({ [SCENE]: 'v1' })
  const hashes = new Map([[SCENE, sha('v1')]])
  const events: ChangeEvent[] = []
  const watcher = createChangeWatcher({
    io,
    project: {
      manifest: { manuscript: [{ id: 's', path: SCENE, children: [] }] },
      knownHash: (p: string) => hashes.get(p),
    } as never,
    isDirty: () => dirty,
    reload: vi.fn(async () => {}),
    onEvent: (e) => events.push(e),
  })
  return { io, hashes, events, watcher }
}

describe('change watcher: repeated checks', () => {
  it('kept version is not prompted again on the next focus', async () => {
    const t = setup(true)
    t.io.files.set(SCENE, 'v2')
    await t.watcher.recheck()
    await t.watcher.recheck()
    expect(t.events).toHaveLength(1)
  })

  it('a further outside edit prompts again', async () => {
    const t = setup(true)
    t.io.files.set(SCENE, 'v2')
    await t.watcher.recheck()
    t.io.files.set(SCENE, 'v3')
    await t.watcher.recheck()
    expect(t.events).toHaveLength(2)
  })

  it('a deleted file is reported once', async () => {
    const t = setup(false)
    await t.io.remove(SCENE)
    await t.watcher.recheck()
    await t.watcher.recheck()
    expect(t.events).toEqual([{ kind: 'deleted', path: SCENE }])
  })

  it('a read error goes to onError and does not stop other paths', async () => {
    const t = setup(false)
    const errors: unknown[] = []
    ;(t.io as { failOn?: (op: string, p: string) => boolean }).failOn = (op, p) =>
      op === 'readText' && p === SCENE
    const w = createChangeWatcher({
      io: t.io,
      project: { manifest: {}, knownHash: (p: string) => t.hashes.get(p) ?? 'x' } as never,
      isDirty: () => false,
      reload: async () => {},
      onEvent: (e) => t.events.push(e),
      onError: (e) => errors.push(e),
    })
    await w.handle([SCENE, 'project.json'])
    expect(errors).toHaveLength(1)
    expect(t.events).toEqual([{ kind: 'deleted', path: 'project.json' }])
  })
})
