import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { sceneSchema, SCENE_VERSION } from './schemas/scene'
import { serialize } from './serialize'
import { LOCK_PATH } from './lock'
import { defaultExportOptions } from '../export/options'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory, useSettingsStore } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from './store'

const META = { title: 'My Book', author: 'Ann', language: 'en' }
let io: MemoryProjectIO

beforeEach(() => {
  io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

function freshStore() {
  setActivePinia(createPinia())
  return useProjectStore()
}

async function openedStore() {
  const s = freshStore()
  expect(await s.create('book', META)).toBe('opened')
  const scene = s.tree[0].children[0]
  return { s, scene, path: scene.path as string }
}

const otherHolder = () => JSON.stringify({ machine: 'elsewhere', pid: 42, timestamp: Date.now() })

describe('project store', () => {
  it('create, close, open shows the scene', async () => {
    const { s, path } = await openedStore()
    await s.close()
    expect(s.project).toBeNull()
    expect(await s.open('book/project.json')).toBe('opened')
    expect(s.rootPath).toBe('book')
    expect(s.tree[0].title).toBe('Chapter 1')
    const r = await s.loadScene(path)
    expect(r.ok).toBe(true)
  })

  it('opening adds the project to the recent list', async () => {
    const { s } = await openedStore()
    const recent = useSettingsStore().settings.recentProjects
    expect(recent.map((r) => [r.path, r.title])).toEqual([['book', 'My Book']])
    await s.close()
  })

  it('a held lock asks first; read-only opens the project without writing', async () => {
    const { s } = await openedStore()
    await s.close()
    io.files.set(LOCK_PATH, otherHolder())
    expect(await s.open('book')).toBe('needs-choice')
    expect(s.lockPrompt?.holder.machine).toBe('elsewhere')
    expect(s.project).toBeNull()
    expect(await s.resolveLockPrompt('readOnly')).toBe('opened')
    expect(s.lockPrompt).toBeNull()
    expect(s.readOnly).toEqual({ reason: 'locked-elsewhere' })
    expect(JSON.parse(io.files.get(LOCK_PATH) as string).machine).toBe('elsewhere')
  })

  it('cancelling the lock prompt opens nothing', async () => {
    const { s } = await openedStore()
    await s.close()
    io.files.set(LOCK_PATH, otherHolder())
    await s.open('book')
    expect(await s.resolveLockPrompt('cancel')).toBe('cancelled')
    expect(s.project).toBeNull()
    expect(s.lockPrompt).toBeNull()
  })

  it('edits are saved after flush; read-only edits are refused', async () => {
    const { s, path } = await openedStore()
    const r = await s.loadScene(path)
    if (!r.ok) throw new Error('scene invalid')
    expect(s.updateItem(path, sceneSchema, { ...r.value, synopsis: 'Hello' })).toBe(true)
    await s.flush()
    expect(io.files.get(path)).toContain('Hello')
    expect(s.saveStatus).toBe('saved')

    await s.close()
    io.files.set(LOCK_PATH, otherHolder())
    await s.open('book')
    await s.resolveLockPrompt('readOnly')
    expect(s.updateItem(path, sceneSchema, { ...r.value, synopsis: 'Nope' })).toBe(false)
    await s.flush()
    expect(io.files.get(path)).not.toContain('Nope')
  })

  it('check toggles default to enabled and are saved in the manifest', async () => {
    const { s } = await openedStore()
    expect(s.isCheckEnabled('date-order')).toBe(true)
    s.setCheckEnabled('date-order', false)
    expect(s.isCheckEnabled('date-order')).toBe(false)
    expect(s.isCheckEnabled('other')).toBe(true)
    await s.flush()
    expect(JSON.parse(io.files.get('project.json') as string).checkSettings).toEqual({
      'date-order': false,
    })
  })

  it('export settings default, validate, and are saved in the manifest', async () => {
    const { s } = await openedStore()
    expect(s.exportSettings).toEqual(defaultExportOptions())
    const next = { ...defaultExportOptions(), pageSize: 'A5' as const, fontSizePt: 12 }
    expect(s.setExportSettings(next)).toBe(true)
    expect(s.exportSettings.pageSize).toBe('A5')
    expect(s.setExportSettings({ ...next, fontSizePt: 99 })).toBe(false)
    expect(s.exportSettings.fontSizePt).toBe(12)
    await s.flush()
    expect(JSON.parse(io.files.get('project.json') as string).exportSettings).toEqual(next)
  })

  it('deleting moves the item to the trash; restore puts it back', async () => {
    const { s, scene, path } = await openedStore()
    await s.deleteItem(scene.id)
    expect(s.trash.map((t) => t.id)).toContain(scene.id)
    expect(s.tree[0].children).toHaveLength(0)
    expect(io.files.has(path)).toBe(false)
    await s.restoreItem(scene.id)
    expect(s.trash).toHaveLength(0)
    expect(s.tree[0].children[0].id).toBe(scene.id)
    expect(io.files.has(path)).toBe(true)
  })

  it('a link to a trashed scene counts as broken until restore', async () => {
    const { s, scene, path } = await openedStore()
    const other = await s.addScene(s.tree[0].id, 'Second')
    const otherPath = s.tree[0].children[1].path as string
    const r = await s.loadScene(otherPath)
    if (!r.ok) throw new Error('scene invalid')
    s.updateItem(otherPath, sceneSchema, {
      ...r.value,
      links: [{ id: 'l1', from: { item: other }, to: { item: scene.id }, kind: 'ref' }],
    })
    expect(s.brokenLinkCount).toBe(0)
    await s.deleteItem(scene.id)
    expect(s.brokenLinkCount).toBe(1)
    await s.restoreItem(scene.id)
    expect(s.brokenLinkCount).toBe(0)
    expect(io.files.has(path)).toBe(true)
  })

  it('addScene, rename and moveUpDown change the manifest on disk', async () => {
    const { s, scene } = await openedStore()
    const second = await s.addScene(s.tree[0].id, 'Second')
    await s.rename(second, 'Renamed')
    expect(await s.moveUpDown(second, 'up')).toBe(true)
    expect(await s.moveUpDown(second, 'up')).toBe(false)
    await s.flush()
    const manifest = JSON.parse(io.files.get('project.json') as string)
    expect(manifest.manuscript[0].children.map((c: { id: string }) => c.id)).toEqual([
      second,
      scene.id,
    ])
    expect(manifest.manuscript[0].children[0].title).toBe('Renamed')
  })

  it('outside change on an edited item prompts; keep does not touch the file', async () => {
    const { s, path } = await openedStore()
    const r = await s.loadScene(path)
    if (!r.ok) throw new Error('scene invalid')
    s.updateItem(path, sceneSchema, { ...r.value, title: 'Mine' })
    const theirs = serialize(sceneSchema, { ...r.value, title: 'Theirs' })
    io.files.set(path, theirs)
    io.emit([path])
    await expect.poll(() => s.externalPrompts.length).toBe(1)
    expect(s.externalPrompts[0].path).toBe(path)

    await s.resolveExternal(path, 'keep')
    expect(s.externalPrompts).toHaveLength(0)
    expect(io.files.get(path)).toBe(theirs)
    await s.flush()
    expect(io.files.get(path)).toContain('Mine')
  })

  it('outside change with no edits reloads silently', async () => {
    const { s, path } = await openedStore()
    const r = await s.loadScene(path)
    if (!r.ok) throw new Error('scene invalid')
    io.files.set(path, serialize(sceneSchema, { ...r.value, title: 'Theirs' }))
    io.emit([path])
    await expect.poll(() => s.itemVersion(path)).toBe(1)
    expect(s.externalPrompts).toHaveLength(0)
  })

  it('reload drops my unsaved version', async () => {
    const { s, path } = await openedStore()
    const r = await s.loadScene(path)
    if (!r.ok) throw new Error('scene invalid')
    s.updateItem(path, sceneSchema, { ...r.value, title: 'Mine' })
    io.files.set(path, serialize(sceneSchema, { ...r.value, title: 'Theirs' }))
    io.emit([path])
    await expect.poll(() => s.externalPrompts.length).toBe(1)
    await s.resolveExternal(path, 'reload')
    const again = await s.loadScene(path)
    expect(again.ok && again.value.title).toBe('Theirs')
    await s.flush()
    expect(io.files.get(path)).toContain('Theirs')
  })

  it('project.json changed outside raises the flag; reloadManifest picks it up', async () => {
    const { s } = await openedStore()
    const m = JSON.parse(io.files.get('project.json') as string)
    m.title = 'Changed Outside'
    io.files.set('project.json', JSON.stringify(m))
    io.emit(['project.json'])
    await expect.poll(() => s.manifestChanged).toBe(true)
    await s.reloadManifest()
    expect(s.manifestChanged).toBe(false)
    expect(s.project?.manifest.title).toBe('Changed Outside')
  })

  it('unlisted scene files can be imported or ignored', async () => {
    const { s, scene } = await openedStore()
    await s.close()
    const mk = (id: string) =>
      serialize(sceneSchema, {
        version: SCENE_VERSION,
        id,
        title: id,
        status: 'draft',
        synopsis: '',
        wordCount: 0,
        content: { type: 'doc', content: [] },
        todos: [],
        comments: [],
        links: [],
      })
    io.files.set('manuscript/a.json', mk('a'))
    io.files.set('manuscript/b.json', mk('b'))
    io.files.set('manuscript/bad.json', '{ nope')
    await s.open('book')
    expect(s.issues.filter((i) => i.kind === 'unlisted')).toHaveLength(3)
    const out = await s.importUnlisted(['manuscript/a.json', 'manuscript/bad.json'])
    expect(out.imported).toEqual(['manuscript/a.json'])
    expect(out.skipped.map((x) => x.path)).toEqual(['manuscript/bad.json'])
    expect(s.tree[0].children.map((c) => c.id)).toEqual([scene.id, 'a'])
    s.ignoreUnlisted(['manuscript/b.json', 'manuscript/bad.json'])
    expect(s.issues.filter((i) => i.kind === 'unlisted')).toHaveLength(0)
    await s.flush()
    expect(io.files.get('manuscript/b.json')).toBeDefined()
  })

  it('an invalid manifest is refused and left untouched', async () => {
    io.files.set('project.json', '{ not json')
    const s = freshStore()
    expect(await s.open('book')).toBe('failed')
    expect(s.openError?.kind).toBe('refused')
    expect(s.project).toBeNull()
    expect(io.files.get('project.json')).toBe('{ not json')
    expect(io.files.has(LOCK_PATH)).toBe(false)
  })

  it('opening takes the lock; closing releases it and clears state', async () => {
    const { s } = await openedStore()
    expect(io.files.has(LOCK_PATH)).toBe(true)
    await s.close()
    expect(io.files.has(LOCK_PATH)).toBe(false)
    expect(s.project).toBeNull()
    expect(s.rootPath).toBeNull()
    expect(s.issues).toEqual([])
  })

  it('close saves pending edits first', async () => {
    const { s, path } = await openedStore()
    const r = await s.loadScene(path)
    if (!r.ok) throw new Error('scene invalid')
    s.updateItem(path, sceneSchema, { ...r.value, synopsis: 'Saved on close' })
    await s.close()
    expect(io.files.get(path)).toContain('Saved on close')
  })

  describe('outline', () => {
    const order = (nodes: { id: string; children: unknown[] }[]): string[] => nodes.map((n) => n.id)
    const manifestTree = () => JSON.parse(io.files.get('project.json') as string).manuscript

    it('addPart, addChapter (root or in a part) and addScene build the tree', async () => {
      const { s } = await openedStore()
      const part = await s.addPart('Part I')
      const ch = await s.addChapter(part, 'Ch A')
      const rootCh = await s.addChapter(null, 'Ch B')
      const sc = await s.addScene(ch, 'S')
      await s.flush()
      const m = manifestTree()
      expect(m.map((n: { id: string; type: string }) => [n.id, n.type])).toEqual([
        [s.tree[0].id, 'chapter'],
        [part, 'part'],
        [rootCh, 'chapter'],
      ])
      expect(m[1].children[0].children[0].id).toBe(sc)
    })

    it('addChapter under a chapter or scene is refused', async () => {
      const { s, scene } = await openedStore()
      await expect(s.addChapter(s.tree[0].id)).rejects.toThrow()
      await expect(s.addChapter(scene.id)).rejects.toThrow()
    })

    it('moveItem re-nests and writes the order; invalid moves change nothing', async () => {
      const { s, scene } = await openedStore()
      const ch2 = await s.addChapter(null, 'Two')
      expect(await s.moveItem(scene.id, ch2, 0)).toBe(true)
      expect(await s.moveItem(ch2, scene.id, 0)).toBe(false) // chapter under a scene
      expect(await s.moveItem('nope', null, 0)).toBe(false)
      await s.flush()
      expect(manifestTree()[1].children.map((c: { id: string }) => c.id)).toEqual([scene.id])
      expect(order(manifestTree()[0].children)).toEqual([])
    })

    it('moveItem is refused when the project is read-only', async () => {
      const { s, scene } = await openedStore()
      await s.close()
      io.files.set(LOCK_PATH, otherHolder())
      await s.open('book')
      await s.resolveLockPrompt('readOnly')
      await expect(s.moveItem(scene.id, null, 0)).rejects.toThrow()
    })

    it('a trashed item restores to its place after a move', async () => {
      const { s, scene } = await openedStore()
      const ch2 = await s.addChapter(null, 'Two')
      await s.moveItem(scene.id, ch2, 0)
      await s.deleteItem(scene.id)
      await s.restoreItem(scene.id)
      expect(s.tree[1].children.map((c) => c.id)).toEqual([scene.id])
      expect(s.sceneMeta.has(scene.id)).toBe(true)
    })

    it('the metadata index is built at open from the scene files', async () => {
      const { s, scene, path } = await openedStore()
      const r = await s.loadScene(path)
      if (!r.ok) throw new Error('scene invalid')
      s.updateItem(path, sceneSchema, {
        ...r.value,
        status: 'final',
        synopsis: 'Syn',
        wordCount: 7,
      })
      await s.close()
      await s.open('book')
      expect(s.sceneMeta.get(scene.id)).toEqual({
        status: 'final',
        synopsis: 'Syn',
        povId: undefined,
        wordCount: 7,
        openTodoIds: [],
      })
    })

    it('editing a scene updates the index and the roll-up at once', async () => {
      const { s, scene, path } = await openedStore()
      const second = await s.addScene(s.tree[0].id, 'Second')
      expect(s.wordCounts.get('')).toBe(0)
      const r = await s.loadScene(path)
      if (!r.ok) throw new Error('scene invalid')
      s.updateItem(path, sceneSchema, { ...r.value, wordCount: 5 })
      expect(s.sceneMeta.get(scene.id)?.wordCount).toBe(5)
      expect(s.wordCounts.get(s.tree[0].id)).toBe(5)
      const p2 = s.tree[0].children[1].path as string
      const r2 = await s.loadScene(p2)
      if (!r2.ok) throw new Error('scene invalid')
      s.updateItem(p2, sceneSchema, { ...r2.value, wordCount: 3 })
      expect(s.sceneMeta.get(second)?.wordCount).toBe(3)
      expect(s.wordCounts.get('')).toBe(8)
    })

    it('setSceneMeta writes status and synopsis to the scene file', async () => {
      const { s, scene, path } = await openedStore()
      expect(await s.setSceneMeta(scene.id, { status: 'revising', synopsis: 'Dawn' })).toBe(true)
      expect(s.sceneMeta.get(scene.id)?.status).toBe('revising')
      await s.flush()
      const file = JSON.parse(io.files.get(path) as string)
      expect([file.status, file.synopsis]).toEqual(['revising', 'Dawn'])
    })

    it('setSceneTodos writes the checklist to the scene file', async () => {
      const { s, scene, path } = await openedStore()
      const todos = [
        { id: 't1', text: 'Fix pacing', done: false },
        { id: 't2', text: 'Name the ship', done: true },
      ]
      expect(await s.setSceneTodos(scene.id, todos)).toBe(true)
      await s.flush()
      expect(JSON.parse(io.files.get(path) as string).todos).toEqual(todos)
      const r = await s.loadScene(path)
      expect(r.ok && r.value.todos).toEqual(todos)
    })

    it('the metadata index tracks open to-do ids', async () => {
      const { s, scene } = await openedStore()
      await s.setSceneTodos(scene.id, [
        { id: 't1', text: 'a', done: false },
        { id: 't2', text: 'b', done: true },
      ])
      expect(s.sceneMeta.get(scene.id)?.openTodoIds).toEqual(['t1'])
    })

    it('setSceneTodos refuses non-scenes, unknown ids and invalid files', async () => {
      const { s, scene, path } = await openedStore()
      const todos = [{ id: 't1', text: 'x', done: false }]
      expect(await s.setSceneTodos(s.tree[0].id, todos)).toBe(false)
      expect(await s.setSceneTodos('nope', todos)).toBe(false)
      await s.close()
      io.files.set(path, '{ broken')
      await s.open('book')
      expect(await s.setSceneTodos(scene.id, todos)).toBe(false)
      expect(io.files.get(path)).toBe('{ broken')
    })

    it('setSceneContent keeps metadata and todos, and updates the word count', async () => {
      const { s, scene, path } = await openedStore()
      await s.setSceneMeta(scene.id, { status: 'final', synopsis: 'Dawn' })
      await s.setSceneTodos(scene.id, [{ id: 't1', text: 'x', done: false }])
      const doc = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'p1' } }] }
      expect(await s.setSceneContent(scene.id, doc, 3)).toBe(true)
      expect(s.wordCounts.get(scene.id)).toBe(3)
      await s.flush()
      const file = JSON.parse(io.files.get(path) as string)
      expect([file.status, file.synopsis, file.wordCount, file.todos.length]).toEqual([
        'final',
        'Dawn',
        3,
        1,
      ])
      expect(file.content).toEqual(doc)
    })

    describe('comments', () => {
      const marked = (...ids: string[]) => ({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { id: 'p1' },
            content: ids.map((id) => ({
              type: 'text',
              text: 'x',
              marks: [{ type: 'comment', attrs: { commentId: id } }],
            })),
          },
        ],
      })
      const saved = async (s: ReturnType<typeof freshStore>, path: string) => {
        await s.flush()
        return JSON.parse(io.files.get(path) as string).comments as Array<{
          id: string
          text: string
          resolved: boolean
          createdAt: string
        }>
      }

      it('adds, edits, resolves and deletes a comment', async () => {
        const { s, scene, path } = await openedStore()
        expect(await s.addSceneComment(scene.id, { id: 'c1', text: 'Check' })).toBe(true)
        let [c] = await saved(s, path)
        expect([c.id, c.text, c.resolved]).toEqual(['c1', 'Check', false])
        expect(Number.isNaN(Date.parse(c.createdAt))).toBe(false)
        expect(await s.updateSceneComment(scene.id, 'c1', { text: 'Check again' })).toBe(true)
        expect(await s.updateSceneComment(scene.id, 'c1', { resolved: true })).toBe(true)
        ;[c] = await saved(s, path)
        expect([c.text, c.resolved]).toEqual(['Check again', true])
        expect(await s.updateSceneComment(scene.id, 'nope', { text: 'x' })).toBe(false)
        expect(await s.deleteSceneComment(scene.id, 'c1')).toBe(true)
        expect(await saved(s, path)).toEqual([])
      })

      it('drops comments whose mark is gone only when pruned', async () => {
        const { s, scene, path } = await openedStore()
        await s.addSceneComment(scene.id, { id: 'c1', text: 'a' })
        await s.addSceneComment(scene.id, { id: 'c2', text: 'b' })
        await s.setSceneContent(scene.id, marked('c1', 'c2'), 1)
        expect((await saved(s, path)).map((c) => c.id)).toEqual(['c1', 'c2'])
        await s.setSceneContent(scene.id, marked('c2'), 1)
        expect((await saved(s, path)).map((c) => c.id)).toEqual(['c1', 'c2'])
        await s.pruneSceneComments(scene.id)
        expect((await saved(s, path)).map((c) => c.id)).toEqual(['c2'])
      })

      it('refuses comment changes on invalid files', async () => {
        const { s, scene, path } = await openedStore()
        await s.close()
        io.files.set(path, '{ broken')
        await s.open('book')
        expect(await s.addSceneComment(scene.id, { id: 'c1', text: 'a' })).toBe(false)
        expect(io.files.get(path)).toBe('{ broken')
      })
    })

    it('concurrent scene writes do not lose each other', async () => {
      const { s, scene, path } = await openedStore()
      const doc = { type: 'doc', content: [] }
      await Promise.all([
        s.setSceneContent(scene.id, doc, 1),
        s.setSceneMeta(scene.id, { status: 'revising' }),
        s.rename(scene.id, 'Renamed'),
        s.setSceneTodos(scene.id, [{ id: 't1', text: 'x', done: true }]),
      ])
      await s.flush()
      const file = JSON.parse(io.files.get(path) as string)
      expect([file.status, file.title, file.wordCount, file.todos.length]).toEqual([
        'revising',
        'Renamed',
        1,
        1,
      ])
    })

    it('setSceneMeta refuses non-scenes, unknown ids and invalid files', async () => {
      const { s, scene, path } = await openedStore()
      expect(await s.setSceneMeta(s.tree[0].id, { status: 'final' })).toBe(false)
      expect(await s.setSceneMeta('nope', { status: 'final' })).toBe(false)
      await s.close()
      io.files.set(path, '{ broken')
      await s.open('book')
      expect(await s.setSceneMeta(scene.id, { status: 'final' })).toBe(false)
      expect(io.files.get(path)).toBe('{ broken')
      expect(s.sceneMeta.has(scene.id)).toBe(false)
    })
  })
  describe('re-home after save', () => {
    const para = (id: string) => ({ type: 'paragraph', attrs: { id } })
    const doc = (...ids: string[]) => ({ type: 'doc', content: ids.map(para) })
    const link = (from: string) => ({
      id: 'l1',
      kind: 'event',
      from: { item: from, block: 'b1' },
      to: { item: 'tl', block: 'n1' },
    })
    const linksOf = (path: string) => JSON.parse(io.files.get(path) as string).links

    async function twoScenes() {
      const { s, scene, path } = await openedStore()
      const b = await s.addScene(s.tree[0].id, 'Second')
      const bPath = s.tree[0].children[1].path as string
      await s.setSceneContent(scene.id, doc('b1'), 1)
      await s.setSceneContent(b, doc(), 0)
      await s.flush()
      const r = await s.loadScene(path)
      if (!r.ok) throw new Error('invalid')
      s.updateItem(path, sceneSchema, { ...r.value, links: [link(scene.id)] })
      await s.flush()
      return { s, a: scene.id, aPath: path, b, bPath }
    }

    it('moves a link with its block to the other scene', async () => {
      const { s, a, aPath, b, bPath } = await twoScenes()
      await s.setSceneContent(a, doc(), 0)
      await s.setSceneContent(b, doc('b1'), 1)
      await s.flush()
      expect(linksOf(aPath)).toEqual([])
      expect(linksOf(bPath)).toEqual([link(b)])
    })

    it('keeps the link where it is when the block was deleted', async () => {
      const { s, a, aPath } = await twoScenes()
      await s.setSceneContent(a, doc(), 0)
      await s.flush()
      expect(linksOf(aPath)).toEqual([link(a)])
    })
  })
})

describe('relation refs in the project store', () => {
  it('setRelationRefs replaces the lists and saves them to project.json', async () => {
    const { s } = await openedStore()
    s.setRelationRefs({
      relationTypes: [{ id: 't1', path: 'relation-types/t1.json', title: 'Friend' }],
      relationLayout: { id: 'lay', path: 'relationships/layout.json' },
    })
    expect(s.project?.manifest.relationTypes).toHaveLength(1)
    await s.flush()
    const disk = JSON.parse(io.files.get('project.json') as string)
    expect(disk.relationTypes[0].id).toBe('t1')
    expect(disk.relationLayout.id).toBe('lay')
    await s.close()
  })

  it('an invalid relationship file is reported under its id', async () => {
    const { s } = await openedStore()
    await s.close()
    const m = JSON.parse(io.files.get('project.json') as string)
    m.relationships = [{ id: 'r1', path: 'relationships/r1.json' }]
    io.files.set('project.json', JSON.stringify(m))
    io.files.set('relationships/r1.json', '{"version":1}')
    await s.open('book')
    expect(s.issues).toEqual([expect.objectContaining({ kind: 'invalid', itemId: 'r1' })])
    await s.close()
  })
})

describe('state kind refs in the project store', () => {
  it('setStateKindRefs replaces the list and saves it to project.json', async () => {
    const { s } = await openedStore()
    s.setStateKindRefs({ stateKinds: [{ id: 'k1', path: 'state-kinds/k1.json', title: 'Location' }] })
    expect(s.project?.manifest.stateKinds).toHaveLength(1)
    await s.flush()
    expect(JSON.parse(io.files.get('project.json') as string).stateKinds[0].id).toBe('k1')
    await s.close()
  })

  it('an invalid state kind file is reported under its id', async () => {
    const { s } = await openedStore()
    await s.close()
    const m = JSON.parse(io.files.get('project.json') as string)
    m.stateKinds = [{ id: 'k1', path: 'state-kinds/k1.json' }, ...m.stateKinds]
    io.files.set('project.json', JSON.stringify(m))
    io.files.set('state-kinds/k1.json', '{"version":1}')
    await s.open('book')
    expect(s.issues).toEqual([expect.objectContaining({ kind: 'invalid', itemId: 'k1' })])
    await s.close()
  })
})
