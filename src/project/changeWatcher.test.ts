import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createChangeWatcher } from './changeWatcher'
import { createMemoryProjectIO } from './io/memory'
import type { ChangeEvent, OpenProject } from './types'

// knownHash values are lowercase hex SHA-256 of the UTF-8 file text.
const sha = (text: string) => createHash('sha256').update(text).digest('hex')

const SCENE = 'manuscript/one.json'
const OTHER = 'manuscript/two.json'
const MANIFEST = 'project.json'

function setup(opts: { dirty?: string[] } = {}) {
  const io = createMemoryProjectIO({
    [MANIFEST]: '{"v":1}',
    [SCENE]: 'scene one',
    [OTHER]: 'scene two',
  })
  const hashes = new Map<string, string>()
  for (const [path, text] of io.files) hashes.set(path, sha(text))
  const manifest = {
    manuscript: [
      { id: 's1', type: 'scene', title: 'One', path: SCENE, children: [] },
      { id: 's2', type: 'scene', title: 'Two', path: OTHER, children: [] },
    ],
  }
  const project = {
    manifest,
    knownHash: (path: string) => hashes.get(path),
  } as unknown as Pick<OpenProject, 'knownHash' | 'manifest'>
  const dirty = new Set(opts.dirty ?? [])
  const events: ChangeEvent[] = []
  const reload = vi.fn<(path: string) => Promise<void>>(async () => {})
  const readSpy = vi.spyOn(io, 'readText')
  const watcher = createChangeWatcher({
    io,
    project,
    isDirty: (path) => dirty.has(path),
    reload,
    onEvent: (e) => events.push(e),
  })
  return { io, hashes, dirty, events, reload, readSpy, watcher }
}

describe('change watcher: own writes', () => {
  it('content matching the known hash raises no event', async () => {
    const t = setup()
    await t.watcher.handle([SCENE])
    expect(t.events).toEqual([])
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('own write arriving while the known hash is being updated raises no event', async () => {
    const t = setup({ dirty: [SCENE] })
    t.io.files.set(SCENE, 'saved by the app')
    const pending = t.watcher.handle([SCENE])
    t.hashes.set(SCENE, sha('saved by the app')) // save finishes while the file is being checked
    await pending
    expect(t.events).toEqual([])
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('a file with no known hash is ignored', async () => {
    const t = setup()
    t.io.files.set('manuscript/unlisted.json', 'dropped in by hand')
    await t.watcher.handle(['manuscript/unlisted.json'])
    expect(t.events).toEqual([])
  })
})

describe('change watcher: outside edit of an item', () => {
  it('not dirty: reloads and reports reloaded', async () => {
    const t = setup()
    t.io.files.set(SCENE, 'edited elsewhere')
    await t.watcher.handle([SCENE])
    expect(t.reload).toHaveBeenCalledWith(SCENE)
    expect(t.events).toEqual([{ kind: 'reloaded', path: SCENE }])
  })

  it('reload finishes before the reloaded event', async () => {
    const t = setup()
    const order: string[] = []
    t.reload.mockImplementation(async () => {
      await Promise.resolve()
      order.push('reload')
    })
    const w = createChangeWatcher({
      io: t.io,
      project: { manifest: {}, knownHash: (p: string) => t.hashes.get(p) } as never,
      isDirty: () => false,
      reload: t.reload,
      onEvent: () => order.push('event'),
    })
    t.io.files.set(SCENE, 'edited elsewhere')
    await w.handle([SCENE])
    expect(order).toEqual(['reload', 'event'])
  })

  it('dirty: prompts with reload and keep, and does not reload', async () => {
    const t = setup({ dirty: [SCENE] })
    t.io.files.set(SCENE, 'edited elsewhere')
    await t.watcher.handle([SCENE])
    expect(t.events).toEqual([{ kind: 'prompt', path: SCENE, choices: ['reload', 'keep'] }])
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('only the changed file is reloaded', async () => {
    const t = setup()
    t.io.files.set(SCENE, 'edited elsewhere')
    await t.watcher.handle([SCENE, OTHER])
    expect(t.reload).toHaveBeenCalledTimes(1)
    expect(t.reload).toHaveBeenCalledWith(SCENE)
  })

  it('dirty state is per path', async () => {
    const t = setup({ dirty: [OTHER] })
    t.io.files.set(SCENE, 'edited elsewhere')
    await t.watcher.handle([SCENE])
    expect(t.events).toEqual([{ kind: 'reloaded', path: SCENE }])
  })
})

describe('change watcher: manifest and deletions', () => {
  it('project.json changed outside raises manifest-changed', async () => {
    const t = setup()
    t.io.files.set(MANIFEST, '{"v":2}')
    await t.watcher.handle([MANIFEST])
    expect(t.events).toEqual([{ kind: 'manifest-changed' }])
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('project.json change is reported even when items are dirty', async () => {
    const t = setup({ dirty: [SCENE, MANIFEST] })
    t.io.files.set(MANIFEST, '{"v":2}')
    await t.watcher.handle([MANIFEST])
    expect(t.events).toEqual([{ kind: 'manifest-changed' }])
  })

  it('project.json matching the known hash raises nothing', async () => {
    const t = setup()
    await t.watcher.handle([MANIFEST])
    expect(t.events).toEqual([])
  })

  it('file deleted outside raises deleted and does not reload', async () => {
    const t = setup()
    await t.io.remove(SCENE)
    await t.watcher.handle([SCENE])
    expect(t.events).toEqual([{ kind: 'deleted', path: SCENE }])
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('deleted is reported even when the item is dirty', async () => {
    const t = setup({ dirty: [SCENE] })
    await t.io.remove(SCENE)
    await t.watcher.handle([SCENE])
    expect(t.events).toEqual([{ kind: 'deleted', path: SCENE }])
  })

  it('a path that never existed and is not known raises nothing', async () => {
    const t = setup()
    await t.watcher.handle(['manuscript/ghost.json'])
    expect(t.events).toEqual([])
  })
})

describe('change watcher: ignored paths', () => {
  it('.storyworks internals are ignored without being read', async () => {
    const t = setup()
    t.io.files.set('.storyworks/project.lock', '{"x":1}')
    t.io.files.set('.storyworks/backups/pre-migration-v0-1/project.json', 'old')
    t.io.files.set('.storyworks/trash/s1/one.json', 'trashed')
    t.readSpy.mockClear()
    await t.watcher.handle([
      '.storyworks/project.lock',
      '.storyworks/backups/pre-migration-v0-1/project.json',
      '.storyworks/trash/s1/one.json',
    ])
    expect(t.events).toEqual([])
    expect(t.readSpy).not.toHaveBeenCalled()
  })

  it('ignored paths in a batch do not hide real changes', async () => {
    const t = setup()
    t.io.files.set(SCENE, 'edited elsewhere')
    await t.watcher.handle(['.storyworks/project.lock', SCENE])
    expect(t.events).toEqual([{ kind: 'reloaded', path: SCENE }])
  })
})

describe('change watcher: recheck on focus', () => {
  it('finds an outside edit the watcher missed', async () => {
    const t = setup()
    t.io.files.set(SCENE, 'edited while no event arrived')
    await t.watcher.recheck()
    expect(t.events).toEqual([{ kind: 'reloaded', path: SCENE }])
  })

  it('raises nothing when every file still matches', async () => {
    const t = setup()
    await t.watcher.recheck()
    expect(t.events).toEqual([])
  })

  it('finds a missed manifest change', async () => {
    const t = setup()
    t.io.files.set(MANIFEST, '{"v":2}')
    await t.watcher.recheck()
    expect(t.events).toEqual([{ kind: 'manifest-changed' }])
  })

  it('finds a missed deletion', async () => {
    const t = setup()
    await t.io.remove(OTHER)
    await t.watcher.recheck()
    expect(t.events).toEqual([{ kind: 'deleted', path: OTHER }])
  })

  it('prompts for a dirty file that changed', async () => {
    const t = setup({ dirty: [OTHER] })
    t.io.files.set(OTHER, 'edited elsewhere')
    await t.watcher.recheck()
    expect(t.events).toEqual([{ kind: 'prompt', path: OTHER, choices: ['reload', 'keep'] }])
  })
})

describe('change watcher: start and stop', () => {
  it('start listens to io.watch and handles reported paths', async () => {
    const t = setup()
    await t.watcher.start()
    t.io.files.set(SCENE, 'edited elsewhere')
    t.io.emit([SCENE])
    await vi.waitFor(() => expect(t.events).toEqual([{ kind: 'reloaded', path: SCENE }]))
  })

  it('stop unsubscribes: later changes raise no events', async () => {
    const t = setup()
    await t.watcher.start()
    await t.watcher.stop()
    t.io.files.set(SCENE, 'edited elsewhere')
    t.io.emit([SCENE])
    await new Promise((r) => setTimeout(r, 30))
    expect(t.events).toEqual([])
    expect(t.reload).not.toHaveBeenCalled()
  })
})
