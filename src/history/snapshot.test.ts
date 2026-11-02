import { describe, expect, it } from 'vitest'
import { manifestSchema } from '../project/schemas/manifest'
import { createSnapshot, loadChanges, snapshotChanges } from './snapshot'
import { chapterNode, makeKit, sceneNode, type Kit } from './testKit'

const dec = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null)
const head = async (k: Kit) => (await k.engine.log())[0].id
const headManifest = async (k: Kit) => JSON.parse(dec(await k.engine.readFile(await head(k), 'project.json'))!)
const headText = async (k: Kit, path: string) => dec(await k.engine.readFile(await head(k), path))
const first = (k: Kit) => createSnapshot(k.engine, k.io, k.env, { keys: 'all' })

describe('createSnapshot', () => {
  it('partial: two of three edited scenes are recorded, the third stays changed', async () => {
    const k = await makeKit()
    await first(k)
    for (const id of ['s1', 's2', 's3']) await k.scene(id, `${id}-2`)
    await createSnapshot(k.engine, k.io, k.env, { keys: ['node:s1', 'node:s2'] })
    expect(await headText(k, 'manuscript/s1.json')).toBe('s1-2')
    expect(await headText(k, 'manuscript/s2.json')).toBe('s2-2')
    expect(await headText(k, 'manuscript/s3.json')).toBe('s3-1')
    const left = await loadChanges(k.engine, k.io)
    expect(left.map((i) => i.key)).toEqual(['node:s3'])
    expect(k.text('manuscript/s3.json')).toBe('s3-2')
  })

  it('partial: an added scene brings its manifest entry, an excluded one does not', async () => {
    const k = await makeKit()
    await first(k)
    const ch = k.manifest.manuscript[0]
    ch.children.splice(1, 0, sceneNode('n1', 'New 1'))
    ch.children.push(sceneNode('n2', 'New 2'))
    await k.save()
    await k.scene('n1', 'n1-1')
    await k.scene('n2', 'n2-1')
    await createSnapshot(k.engine, k.io, k.env, { keys: ['node:n1'] })
    const m = await headManifest(k)
    expect(m.manuscript[0].children.map((c: { id: string }) => c.id)).toEqual(['s1', 'n1', 's2', 's3'])
    expect(manifestSchema.safeParse(m).success).toBe(true)
    expect(await headText(k, 'manuscript/n2.json')).toBeNull()
    expect((await loadChanges(k.engine, k.io)).map((i) => i.key)).toEqual(['node:n2'])
  })

  it('partial: a deleted scene is removed from the recorded manifest and its file', async () => {
    const k = await makeKit()
    await first(k)
    k.manifest.manuscript[0].children.splice(1, 1)
    await k.save()
    await k.io.remove('manuscript/s2.json')
    await k.scene('s1', 's1-2')
    await createSnapshot(k.engine, k.io, k.env, { keys: ['node:s2'] })
    const m = await headManifest(k)
    expect(m.manuscript[0].children.map((c: { id: string }) => c.id)).toEqual(['s1', 's3'])
    expect(await headText(k, 'manuscript/s2.json')).toBeNull()
    expect(await headText(k, 'manuscript/s1.json')).toBe('s1-1')
  })

  it('selecting an added scene also takes its added chapter', async () => {
    const k = await makeKit()
    await first(k)
    k.manifest.manuscript.push(chapterNode('ch2', 'Chapter 2', [sceneNode('n1', 'New 1')]))
    await k.save()
    await k.scene('n1', 'n1-1')
    const r = await createSnapshot(k.engine, k.io, k.env, { keys: ['node:n1'] })
    expect(r.pulledIn).toEqual(['node:ch2'])
    const m = await headManifest(k)
    expect(m.manuscript[1].children[0].id).toBe('n1')
    expect(await loadChanges(k.engine, k.io)).toEqual([])
  })

  it('selecting a deleted chapter also takes the deletion of its scenes', async () => {
    const k = await makeKit()
    await first(k)
    k.manifest.manuscript = []
    await k.save()
    for (const id of ['s1', 's2', 's3']) await k.io.remove(`manuscript/${id}.json`)
    const r = await createSnapshot(k.engine, k.io, k.env, { keys: ['node:ch1'] })
    expect(r.pulledIn.sort()).toEqual(['node:s1', 'node:s2', 'node:s3'])
    expect((await headManifest(k)).manuscript).toEqual([])
  })

  it('partial: a moved scene is recorded in its new place', async () => {
    const k = await makeKit()
    await first(k)
    const [s1, s2, s3] = k.manifest.manuscript[0].children
    k.manifest.manuscript[0].children = [s3, s1, s2]
    k.manifest.manuscript[0].title = 'Renamed'
    await k.save()
    await createSnapshot(k.engine, k.io, k.env, { keys: ['node:s3'] })
    const m = await headManifest(k)
    expect(m.manuscript[0].children.map((c: { id: string }) => c.id)).toEqual(['s3', 's1', 's2'])
    expect(m.manuscript[0].title).toBe('Chapter 1')
    expect((await loadChanges(k.engine, k.io)).map((i) => i.key)).toEqual(['node:ch1'])
  })

  it('partial: settings are taken only when selected', async () => {
    const k = await makeKit()
    await first(k)
    k.manifest.title = 'New title'
    await k.scene('s1', 's1-2')
    await createSnapshot(k.engine, k.io, k.env, { keys: ['node:s1'] })
    expect((await headManifest(k)).title).toBe('Book')
    await k.save()
    await createSnapshot(k.engine, k.io, k.env, { keys: ['settings'] })
    expect((await headManifest(k)).title).toBe('New title')
  })

  it('takes the whole manifest when the format version differs from the last snapshot', async () => {
    const k = await makeKit()
    const old = { ...JSON.parse(k.text('project.json')!), version: 10 }
    await k.engine.commit({ message: 'old', include: ['manuscript/s1.json', 'manuscript/s2.json', 'manuscript/s3.json'], overrides: { 'project.json': new TextEncoder().encode(JSON.stringify(old)) } })
    await k.scene('s1', 's1-2')
    await k.scene('s2', 's2-2')
    const r = await createSnapshot(k.engine, k.io, k.env, { keys: ['node:s1'] })
    expect(r.forcedAll).toBe(true)
    expect((await headManifest(k)).version).toBe(k.manifest.version)
    expect(await loadChanges(k.engine, k.io)).toEqual([])
  })

  it('refuses when nothing is selected or nothing changed', async () => {
    const k = await makeKit()
    await first(k)
    await expect(first(k)).rejects.toMatchObject({ code: 'nothing-to-commit' })
    await k.scene('s1', 's1-2')
    await expect(createSnapshot(k.engine, k.io, k.env, { keys: [] })).rejects.toMatchObject({ code: 'nothing-to-commit' })
  })

  it('uses the given message, else a timestamp', async () => {
    const k = await makeKit()
    await createSnapshot(k.engine, k.io, k.env, { keys: 'all', message: 'Draft one' })
    await k.scene('s1', 's1-2')
    await first(k)
    const log = await k.engine.log()
    expect(log[1].message).toBe('Draft one')
    expect(log[0].message).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})

describe('snapshotChanges', () => {
  it('describes one snapshot against the one before it', async () => {
    const k = await makeKit()
    await first(k)
    await k.scene('s2', 's2-2')
    k.manifest.manuscript[0].title = 'Renamed'
    await k.save()
    const r = await first(k)
    const items = await snapshotChanges(k.engine, r.id)
    expect(items.map((i) => [i.key, i.kinds])).toEqual([['node:ch1', ['renamed']], ['node:s2', ['modified']]])
  })

  it('lists everything as added for the first snapshot', async () => {
    const k = await makeKit()
    const r = await first(k)
    expect((await snapshotChanges(k.engine, r.id)).every((i) => i.kinds[0] === 'added')).toBe(true)
  })
})
