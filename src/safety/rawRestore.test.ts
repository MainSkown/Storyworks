import { describe, expect, it } from 'vitest'
import { makeBackup } from '../history/backups'
import { createMemoryProjectIO } from '../project/io/memory'
import { createProject, openProject } from '../project/open'
import type { Env } from '../project/types'
import { findLatestAutoBackup, restoreLatestBackupRaw } from './rawRestore'

let n = 0
const env: Env = { now: () => Date.UTC(2026, 10, 3) + ++n * 60_000, newId: () => `id-${++n}` }

async function book() {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'T', author: 'A', language: 'en' }, env)
  return io
}
const snapshot = (io: { files: Map<string, string> }) => JSON.stringify([...io.files])

describe('restoreLatestBackupRaw', () => {
  it('replaces a corrupt project.json from the latest backup and keeps the corrupt file aside', async () => {
    const io = await book()
    const good = io.files.get('project.json')!
    await makeBackup(io, env, 'auto')
    io.files.set('project.json', '<<<<<<< HEAD\n{}')
    expect((await openProject(io, env)).status).toBe('refused')

    const r = await restoreLatestBackupRaw(io, env)
    expect(io.files.get('project.json')).toBe(good)
    expect((await openProject(io, env)).status).toBe('ok')
    expect(io.files.get(`.storyworks/backups/${r.safetyCopy}/project.json`)).toBe('<<<<<<< HEAD\n{}')
  })

  it('uses the newest automatic backup', async () => {
    const io = await book()
    await makeBackup(io, env, 'auto')
    const manifest = JSON.parse(io.files.get('project.json')!)
    manifest.title = 'Newer'
    io.files.set('project.json', JSON.stringify(manifest))
    const newest = await makeBackup(io, env, 'auto')
    io.files.set('project.json', '{oops')
    expect((await findLatestAutoBackup(io))?.name).toBe(newest)
    await restoreLatestBackupRaw(io, env)
    expect(JSON.parse(io.files.get('project.json')!).title).toBe('Newer')
  })

  it('does not delete files that only exist now', async () => {
    const io = await book()
    await makeBackup(io, env, 'auto')
    io.files.set('manuscript/extra.json', 'later work')
    io.files.set('project.json', '{oops')
    await restoreLatestBackupRaw(io, env)
    expect(io.files.get('manuscript/extra.json')).toBe('later work')
  })

  it('fails clearly and touches nothing when there is no automatic backup', async () => {
    const io = await book()
    await makeBackup(io, env, 'safety')
    io.files.set('project.json', '{oops')
    const before = snapshot(io)
    await expect(restoreLatestBackupRaw(io, env)).rejects.toMatchObject({ code: 'no-backup' })
    expect(snapshot(io)).toBe(before)
  })

  it('refuses a backup whose project.json is also broken', async () => {
    const io = await book()
    const name = await makeBackup(io, env, 'auto')
    io.files.set(`.storyworks/backups/${name}/project.json`, '{oops')
    io.files.set('project.json', '{oops2')
    const before = snapshot(io)
    await expect(restoreLatestBackupRaw(io, env)).rejects.toMatchObject({ code: 'backup-invalid' })
    expect(snapshot(io)).toBe(before)
  })

  it('stops with the corrupt manifest still in place when a write fails', async () => {
    const io = await book()
    await makeBackup(io, env, 'auto')
    const scene = [...io.files.keys()].find((k) => k.startsWith('manuscript/'))!
    io.files.set(scene, 'changed')
    io.files.set('project.json', '{oops')
    io.failOn = (op, p) => op === 'writeTextAtomic' && p.startsWith('manuscript/')
    await expect(restoreLatestBackupRaw(io, env)).rejects.toMatchObject({ code: 'failed' })
    expect(io.files.get('project.json')).toBe('{oops')
  })
})
